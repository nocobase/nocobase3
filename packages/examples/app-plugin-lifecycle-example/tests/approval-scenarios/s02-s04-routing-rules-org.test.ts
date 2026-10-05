// Scenarios 2 (conditional routing), 3 (rule versions and requests in
// flight) and 4 (approver changes while the structure stays).
import { describe, expect, it } from 'vitest';

import {
  active,
  approvalHarness,
  assignees,
  decide,
  draft,
  request,
  stages,
  submitted,
  trail,
} from './approval-fixtures.js';

describe('scenario 2: conditional routing by leave days', () => {
  it('ends after the manager for three days or fewer, and records why', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveTiered', { days: 2 });
    const planned = await stages(h, r.id);
    expect(planned.map((stage) => stage.key)).toEqual(['manager']);
    expect(planned[0].because).toBe('2 days ≤ 3');
    expect((await decide(h, r.id, 'li')).status).toBe('approved');
  });

  it('goes manager → department manager → HR above three days', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveTiered', { days: 5 });
    expect((await stages(h, r.id)).map((stage) => stage.key)).toEqual([
      'manager',
      'deptManager',
      'hr',
    ]);
    await decide(h, r.id, 'li');
    expect(await assignees(h, r.id)).toEqual(['wang']);
    await decide(h, r.id, 'wang');
    expect(await assignees(h, r.id)).toEqual(['hr']);
    const done = await decide(h, r.id, 'hr');
    expect(done.status).toBe('approved');
    // The path actually taken and every decision on it stay in its rows.
    expect(
      (await stages(h, r.id)).map((stage) => [
        stage.key,
        stage.status,
        stage.votes[0]?.userId,
      ]),
    ).toEqual([
      ['manager', 'approved', 'li'],
      ['deptManager', 'approved', 'wang'],
      ['hr', 'approved', 'hr'],
    ]);
  });

  it('approves without anyone only through an explicit rule, and says which', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'exempt', {});
    expect(r.status).toBe('approved');
    expect(r.outcomeNote).toBe(
      'Rule v1 requires no approval for this content.',
    );
  });

  it('decides from the submitted content: a later direct edit does not re-route', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveTiered', { days: 2 });
    h.store.patchRecord('scenarioApprovalRequests', r.id, {
      content: { days: 10 },
    });
    const done = await decide(h, r.id, 'li');
    expect(done.status).toBe('approved');
    expect((await trail(h, r.id)).submission?.content).toEqual({ days: 2 });
  });

  it('limitation: nothing stops a direct write to the content under review', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveTiered', { days: 2 });
    // A generic update API or a careless service can change what is under
    // review; the lifecycle protects only its own three fields.
    h.store.patchRecord('scenarioApprovalRequests', r.id, {
      content: { days: 10 },
    });
    expect(request(h, r.id).content).toEqual({ days: 10 });
    expect((await trail(h, r.id)).submission?.content).toEqual({ days: 2 });
  });
});

describe('scenario 3: rule versions and requests in flight', () => {
  it('keeps V1 requests on V1 after V2 is published, and gives new ones V2', async () => {
    const h = approvalHarness();
    const old = await Promise.all(
      [1, 2, 3].map(() => submitted(h, 'leaveVersioned', { days: 1 })),
    );
    h.policies.publish('leaveVersioned', 'v2');
    const fresh = await submitted(h, 'leaveVersioned', { days: 1 });
    expect(fresh.ruleVersion).toBe('v2');
    expect((await stages(h, fresh.id)).map((stage) => stage.key)).toEqual([
      'manager',
      'deptManager',
      'hr',
    ]);
    for (const r of old) {
      await decide(h, r.id, 'li');
      const done = await decide(h, r.id, 'hr');
      expect(done.status).toBe('approved');
      expect(done.ruleVersion).toBe('v1');
    }
  });

  it('keeps the first submission’s version when a returned request is resubmitted', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveVersioned', { days: 1 });
    h.policies.publish('leaveVersioned', 'v2');
    await h.fire(
      'approvalRequests',
      r.id,
      'returnTo',
      { target: 'applicant', reason: 'Fix the dates' },
      'li',
    );
    const again = await h.fire('approvalRequests', r.id, 'submit', {}, 'zhang');
    expect(again).toMatchObject({ ruleVersion: 'v1', round: 2 });
  });

  it('moves one request in flight to V2 explicitly, keeping the approval V2 shares', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveVersioned', { days: 1 });
    await decide(h, r.id, 'li');
    await expect(
      h.fire(
        'approvalRequests',
        r.id,
        'migrateRules',
        { version: 'v2', reason: 'Policy change' },
        'li',
      ),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    const moved = await h.fire(
      'approvalRequests',
      r.id,
      'migrateRules',
      { version: 'v2', reason: 'Policy change' },
      'admin',
    );
    expect(moved).toMatchObject({ ruleVersion: 'v2' });
    expect((await active(h, r.id))?.key).toBe('deptManager');
    expect((await stages(h, r.id))[0].notes.at(-1)).toBe(
      'Kept when moved to rule v2.',
    );
    expect(await h.history('approvalRequests', r.id)).toEqual([
      '$create',
      'submit',
      'decide',
      'migrateRules',
    ]);
  });

  it('limitation: removing a version from code strands the requests that still need it to re-plan', async () => {
    const h = approvalHarness();
    const r = await draft(h, 'leaveVersioned', { days: 1 });
    await h.fire('approvalRequests', r.id, 'submit', {}, 'zhang');
    await h.fire(
      'approvalRequests',
      r.id,
      'returnTo',
      { target: 'applicant', reason: 'x' },
      'li',
    );
    const policy = h.policies.get('leaveVersioned') as {
      versions: Record<string, unknown>;
    };
    delete policy.versions.v1;
    // Deciding needs no rule (the plan is in the stage rows), but planning does.
    await expect(
      h.fire('approvalRequests', r.id, 'submit', {}, 'zhang'),
    ).rejects.toThrow(/no version "v1"/);
  });
});

describe('scenario 4: the approver changes while the structure stays', () => {
  it('leaves an assigned responsibility alone when the manager changes', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveVersioned', { days: 1 });
    h.org.setManager('zhang', 'zhao');
    expect(await assignees(h, r.id)).toEqual(['li']);
    expect(await h.allowed('approvalRequests', r.id, 'li')).toContain('decide');
    expect(await h.allowed('approvalRequests', r.id, 'zhao')).not.toContain(
      'decide',
    );
  });

  it('chooses a later stage by the organization at the time it is entered', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveAtSubmit', { days: 1 });
    // Stage 1 was chosen at submission, stage 2 waits until it is entered.
    expect(
      (await stages(h, r.id)).map((stage) => stage.resolvedAt === null),
    ).toEqual([false, true]);
    h.org.setManager('zhang', 'zhao');
    await decide(h, r.id, 'li');
    expect(await assignees(h, r.id)).toEqual(['zhao']);
  });

  it('moves an existing responsibility only by an explicit, explained reassignment', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveVersioned', { days: 1 });
    h.org.setManager('zhang', 'zhao');
    await h.fire(
      'approvalRequests',
      r.id,
      'reassign',
      { from: 'li', to: 'zhao', reason: 'Reorganized' },
      'admin',
    );
    const stage = await active(h, r.id);
    expect(stage?.assignees[0]).toMatchObject({
      userId: 'zhao',
      via: 'reassign',
      note: 'Reassigned by admin: Reorganized.',
    });
    await expect(decide(h, r.id, 'li')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    await decide(h, r.id, 'zhao');
    expect((await stages(h, r.id))[0].votes[0].userId).toBe('zhao');
  });

  it('refuses a deactivated approver and never treats the gap as approval', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveVersioned', { days: 1 });
    h.org.deactivate('li');
    await expect(decide(h, r.id, 'li')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
      blockers: [expect.objectContaining({ code: 'inactive' })],
    });
    expect(request(h, r.id).status).toBe('inReview');
  });

  it('passes a departed manager over, and says so, when the stage is chosen later', async () => {
    const h = approvalHarness();
    h.org.deactivate('li');
    const r = await submitted(h, 'leaveVersioned', { days: 1 });
    expect(await assignees(h, r.id)).toEqual(['wang']);
    expect((await active(h, r.id))?.notes).toContain(
      'Manager li is inactive; passed to the next level.',
    );
  });
});
