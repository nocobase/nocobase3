// Scenarios 3 (rule versions and requests in flight) and 4 (the approver
// changes while the structure stays).
import { describe, expect, it } from 'vitest';

import { ORG } from '../support/services.js';
import {
  ruledLeaveApproval,
  ruledLeaveLifecycle,
} from '../../server/scenarios/ruled-leave.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const LEAVE = 'scenarioRuledLeaves';

function setup(): Harness & { publish(version: number): void } {
  const parameters: Record<string, unknown> = { ruleVersion: 1 };
  const h = createHarness({
    org: ORG,
    lifecycles: [ruledLeaveLifecycle as never],
    approvals: [ruledLeaveApproval as never],
    parameters: { [LEAVE]: parameters },
  });
  return Object.assign(h, {
    publish: (version: number) => {
      parameters.ruleVersion = version;
    },
  });
}

async function submitted(h: Harness, applicantId = 'zhang'): Promise<string> {
  const record = await h.create(LEAVE, { applicantId, days: 1 }, applicantId);
  await h.fire(LEAVE, record.id, 'submit', {}, applicantId);
  return String(record.id);
}

describe('scenario 3 · rule versions and requests in flight', () => {
  it('keeps V1 requests on V1 after V2 is published, and gives new ones V2', async () => {
    const h = setup();
    const old = [await submitted(h), await submitted(h), await submitted(h)];
    h.publish(2);
    const fresh = await submitted(h);
    expect((await h.runs(LEAVE, fresh))[0]).toMatchObject({ version: 2 });
    await h.answer(LEAVE, fresh, 'li');
    expect(await h.stage(LEAVE, fresh)).toBe('deptManager');
    for (const id of old) {
      await h.answer(LEAVE, id, 'li');
      expect(await h.stage(LEAVE, id)).toBe('hr');
      await h.answer(LEAVE, id, 'hr');
      expect(h.get(LEAVE, id).status).toBe('approved');
      expect((await h.runs(LEAVE, id))[0]).toMatchObject({
        version: 1,
        status: 'approved',
      });
    }
  });

  it('keeps the first submission’s version when a returned request is resubmitted', async () => {
    const h = setup();
    const id = await submitted(h);
    h.publish(2);
    const task = await h.taskOf(LEAVE, id, 'li');
    await h.approvals.returnTo({
      taskId: task.id,
      actor: { id: 'li' },
      to: 'applicant',
      reason: 'Fix the dates',
    });
    expect(h.get(LEAVE, id).status).toBe('draft');
    await h.fire(LEAVE, id, 'submit', {}, 'zhang');
    const runs = await h.runs(LEAVE, id);
    expect(runs.map((run) => [run.status, run.version])).toEqual([
      ['returned', 1],
      ['manager', 1],
    ]);
    expect(runs[1].previousRunId).toBe(runs[0].id);
  });

  it('moves one request in flight to V2 explicitly: the approval V2 shares is kept, and the request goes where V2 needs it', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.answer(LEAVE, id, 'li');
    expect(await h.stage(LEAVE, id)).toBe('hr');
    const migrate = {
      approval: 'ruledLeave',
      lifecycle: LEAVE,
      recordId: id,
      version: 2,
      reason: 'Policy change',
    };
    expect(
      (await refusal(h.approvals.migrate({ ...migrate, actor: { id: 'li' } })))
        .code,
    ).toBe('NOT_ALLOWED');
    const run = await h.approvals.migrate({
      ...migrate,
      actor: { id: 'admin' },
    });
    expect(run.version).toBe(2);
    expect(await h.stage(LEAVE, id)).toBe('deptManager');
    expect(await h.open(LEAVE, id)).toEqual(['wang:pending']);
    expect(await h.runHistory(LEAVE, id)).toEqual([
      '$create',
      'manager.approve',
      'hr.migrate',
    ]);
    // The request never moved: the migration is the run's.
    expect(await h.history(LEAVE, id)).toEqual(['$create', 'submit']);
    expect(
      (await h.events(LEAVE, id))
        .filter(
          (event) => event.kind === 'stage.note' && event.stage === 'manager',
        )
        .map((event) => event.message),
    ).toEqual(['Kept when moved to rule version 2.']);
  });

  it('a migration that needs no move changes the plan alone: the run does not move', async () => {
    const h = setup();
    const id = await submitted(h);
    const [before] = await h.runs(LEAVE, id);
    await h.approvals.migrate({
      approval: 'ruledLeave',
      lifecycle: LEAVE,
      recordId: id,
      version: 2,
      actor: { id: 'admin' },
      reason: 'Policy change',
    });
    expect((await h.runs(LEAVE, id))[0]).toMatchObject({
      status: 'manager',
      version: 2,
      lifecycleVersion: before.lifecycleVersion,
    });
    await h.answer(LEAVE, id, 'li');
    expect(await h.stage(LEAVE, id)).toBe('deptManager');
  });

  it('limitation: a plan is data once made, but a resubmission plans again under its kept version with today’s code', async () => {
    const h = setup();
    const id = await submitted(h);
    // Each run's plan is kept as data: removing the code of a version does
    // not move a run in flight. A resubmission, though, plans anew under the
    // version it keeps, by whatever `when` says now; a structural change
    // without a version bump changes it silently. A fingerprint of
    // `describe()` in a lock file is what would catch that.
    expect(ruledLeaveApproval.describe()).toMatchObject({
      name: 'ruledLeave',
      flow: ['manager', 'deptManager', 'hr'],
    });
    expect(
      (await h.runs(LEAVE, id))[0].plan.map((entry) => entry.included),
    ).toEqual([true, false, true]);
  });
});

describe('scenario 4 · the approver changes while the structure stays', () => {
  it('leaves an assigned responsibility alone when the manager changes', async () => {
    const h = setup();
    const id = await submitted(h);
    h.org.setManager('zhang', 'zhao');
    expect(await h.open(LEAVE, id)).toEqual(['li:pending']);
    expect(await h.actions(LEAVE, id, 'zhao')).toEqual([]);
  });

  it('chooses a stage at entry by the organization then, and one chosen at submission keeps its person', async () => {
    const h = setup();
    h.publish(2);
    const id = await submitted(h);
    // After submission: li reports to zhao now, and HR changes hands.
    h.org.setManager('li', 'zhao');
    h.org.revokeRole('hr', 'hr');
    h.org.grantRole('zhao', 'hr');
    await h.answer(LEAVE, id, 'li');
    expect(await h.open(LEAVE, id)).toEqual(['zhao:pending']);
    await h.answer(LEAVE, id, 'zhao');
    expect(await h.open(LEAVE, id)).toEqual(['hr:pending']);
    const [run] = await h.runs(LEAVE, id);
    expect(run.plan.find((entry) => entry.stage === 'hr')?.people).toEqual([
      'hr',
    ]);
  });

  it('moves an existing responsibility only by an explicit, explained reassignment', async () => {
    const h = setup();
    const id = await submitted(h);
    h.org.setManager('zhang', 'zhao');
    const report = await h.approvals.reassign({
      from: 'li',
      to: 'zhao',
      actor: { id: 'admin' },
      reason: 'Reorganized',
    });
    expect(report).toMatchObject({ failed: [] });
    const [old, current] = await h.tasks(LEAVE, id);
    expect(old).toMatchObject({
      status: 'transferred',
      closeReason: 'Reorganized',
    });
    expect(current).toMatchObject({
      assigneeId: 'zhao',
      via: 'reassign',
      note: 'Reassigned by admin: Reorganized',
      previousTaskId: old.id,
    });
    expect((await refusal(h.answer(LEAVE, id, 'li'))).code).toBe('TASK_CLOSED');
    await h.answer(LEAVE, id, 'zhao');
    expect(await h.stage(LEAVE, id)).toBe('hr');
  });

  it('refuses a deactivated approver and never treats the gap as approval', async () => {
    const h = setup();
    const id = await submitted(h);
    h.org.deactivate('li');
    expect((await refusal(h.answer(LEAVE, id, 'li'))).code).toBe('INACTIVE');
    expect(await h.stage(LEAVE, id)).toBe('manager');
  });

  it('passes a departed manager over, and says so, when the stage is chosen later', async () => {
    const h = setup();
    h.org.deactivate('li');
    const id = await submitted(h);
    expect(await h.open(LEAVE, id)).toEqual(['wang:pending']);
    expect(
      (await h.events(LEAVE, id))
        .filter((event) => event.kind === 'stage.note')
        .map((event) => event.message),
    ).toContain('Manager li is inactive; passed to the next level.');
  });
});
