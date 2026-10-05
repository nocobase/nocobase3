// Scenarios 5 (or-sign), 6 (countersign), 7 (voting) and 8 (sequential).
import { describe, expect, it } from 'vitest';

import {
  active,
  approvalHarness,
  assignees,
  decide,
  request,
  stages,
  submitted,
  versionOf,
} from './approval-fixtures.js';

describe('scenario 5: or-sign', () => {
  it('first response decides: the first approval settles it', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeFirst', {});
    expect(await assignees(h, r.id)).toEqual(['finA', 'finB', 'finC']);
    expect((await decide(h, r.id, 'finB')).status).toBe('approved');
  });

  it('first response decides: the first rejection settles it too', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeFirst', {});
    expect((await decide(h, r.id, 'finC', 'reject')).status).toBe('rejected');
  });

  it('at least one approval: a rejection does not end it while someone can still approve', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeAny', {});
    expect((await decide(h, r.id, 'finA', 'reject')).status).toBe('inReview');
    expect((await decide(h, r.id, 'finB', 'reject')).status).toBe('inReview');
    const done = await decide(h, r.id, 'finC');
    expect(done.status).toBe('approved');
    // Every opinion is kept, the rejections included.
    expect(
      (await stages(h, r.id))[0].votes.map((vote) => vote.decision),
    ).toEqual(['reject', 'reject', 'approve']);
  });

  it('at least one approval: rejected once nobody is left to approve', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeAny', {});
    for (const person of ['finA', 'finB'])
      await decide(h, r.id, person, 'reject');
    expect((await decide(h, r.id, 'finC', 'reject')).status).toBe('rejected');
  });

  it('two people on the same page: one decision stands, the other is refused', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeFirst', {});
    const seen = versionOf(r);
    await decide(h, r.id, 'finA', 'approve', 'OK', { version: seen });
    await expect(
      decide(h, r.id, 'finB', 'reject', 'No', { version: seen }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect((await stages(h, r.id))[0].votes).toHaveLength(1);
  });

  it('the remaining people lose the action the moment it settles', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeAny', {});
    expect(await h.allowed('approvalRequests', r.id, 'finB')).toContain(
      'decide',
    );
    await decide(h, r.id, 'finA');
    expect(await h.allowed('approvalRequests', r.id, 'finB')).toEqual([]);
    await expect(decide(h, r.id, 'finB')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  it('a repeated click is a replay, not a second vote', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeAny', {});
    await decide(h, r.id, 'finA', 'reject', 'No', { requestId: 'click-1' });
    await decide(h, r.id, 'finA', 'reject', 'No', { requestId: 'click-1' });
    expect((await stages(h, r.id))[0].votes).toHaveLength(1);
  });
});

describe('scenario 6: countersign', () => {
  it('needs every reviewer’s approval', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'contractCountersign', {});
    await decide(h, r.id, 'legalA');
    await decide(h, r.id, 'legalB');
    expect(request(h, r.id).status).toBe('inReview');
    expect((await decide(h, r.id, 'legalC')).status).toBe('approved');
  });

  it('ends at the first rejection by default', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'contractCountersign', {});
    await decide(h, r.id, 'legalA');
    expect((await decide(h, r.id, 'legalB', 'reject')).status).toBe('rejected');
  });

  it('collects every opinion first when asked to, and still cannot approve', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'contractCountersign', { collect: true });
    await decide(h, r.id, 'legalA', 'reject');
    expect(request(h, r.id).status).toBe('inReview');
    await decide(h, r.id, 'legalB');
    const done = await decide(h, r.id, 'legalC');
    expect(done.status).toBe('rejected');
    expect((await stages(h, r.id))[0].votes).toHaveLength(3);
  });

  it('counts a person chosen twice once', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'contractCountersign', {
      reviewers: ['legalA', 'legalA', 'legalB'],
    });
    expect(await assignees(h, r.id)).toEqual(['legalA', 'legalB']);
    expect((await active(h, r.id))?.notes).toContain(
      'A person chosen more than once is counted once.',
    );
  });

  it('a departed reviewer blocks rather than approves; a qualified replacement keeps earlier opinions', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'contractCountersign', {
      reviewers: ['legalA', 'legalB'],
    });
    await decide(h, r.id, 'legalA');
    h.org.deactivate('legalB');
    expect(request(h, r.id).status).toBe('inReview');
    await expect(
      h.fire(
        'approvalRequests',
        r.id,
        'reassign',
        { from: 'legalB', to: 'lawyer', reason: 'legalB left' },
        'admin',
      ),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'unqualified' })],
    });
    await h.fire(
      'approvalRequests',
      r.id,
      'reassign',
      { from: 'legalB', to: 'legalC', reason: 'legalB left' },
      'admin',
    );
    const done = await decide(h, r.id, 'legalC');
    expect(done.status).toBe('approved');
    expect((await stages(h, r.id))[0].votes.map((vote) => vote.userId)).toEqual(
      ['legalA', 'legalC'],
    );
  });
});

describe('scenario 7: committee vote, three of five', () => {
  it('two rejections still leave three possible approvals', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'committee', {});
    await decide(h, r.id, 'm1', 'reject');
    expect((await decide(h, r.id, 'm2', 'reject')).status).toBe('inReview');
  });

  it('three rejections make three approvals impossible', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'committee', {});
    for (const member of ['m1', 'm2']) await decide(h, r.id, member, 'reject');
    expect((await decide(h, r.id, 'm3', 'reject')).status).toBe('rejected');
  });

  it('settles at the third approval without waiting for the rest', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'committee', {});
    for (const member of ['m1', 'm2']) await decide(h, r.id, member);
    expect((await decide(h, r.id, 'm4')).status).toBe('approved');
  });

  it('abstentions count as cast but not as approval', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'committee', {});
    await decide(h, r.id, 'm1', 'abstain');
    await decide(h, r.id, 'm2', 'abstain');
    // 0 approvals + 2 undecided cannot reach 3.
    expect((await decide(h, r.id, 'm3', 'reject')).status).toBe('rejected');
  });

  it('a vetoer’s rejection ends it at once', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'committee', {});
    for (const member of ['m1', 'm2']) await decide(h, r.id, member);
    expect((await decide(h, r.id, 'm5', 'reject')).status).toBe('rejected');
  });

  it('takes no abstentions where the rule has none', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeAny', {});
    await expect(decide(h, r.id, 'finA', 'abstain')).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'noAbstention' })],
    });
  });
});

describe('scenario 8: sequential levels', () => {
  it('passes manager → department manager → VP in order, each seeing it only in turn', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'purchaseChain', { amount: 50_000 });
    expect((await stages(h, r.id)).map((stage) => stage.key)).toEqual([
      'manager',
      'deptManager',
      'vp',
    ]);
    expect(await h.allowed('approvalRequests', r.id, 'wang')).toEqual([]);
    await decide(h, r.id, 'li');
    await decide(h, r.id, 'wang');
    expect((await decide(h, r.id, 'vp')).status).toBe('approved');
  });

  it('lets one approval cover a later stage held by the same person, and says so', async () => {
    const h = approvalHarness();
    // zhao's manager is wang, wang's is vp, and the VP stage is vp again.
    const r = await submitted(h, 'purchaseChain', { amount: 50_000 }, 'zhao');
    await decide(h, r.id, 'wang');
    const done = await decide(h, r.id, 'vp');
    expect(done.status).toBe('approved');
    expect((await stages(h, r.id))[2]).toMatchObject({ status: 'skipped' });
    expect((await stages(h, r.id))[2].notes.at(-1)).toBe(
      'vp approved "deptManager" this round; that approval covers this stage.',
    );
  });

  it('never lets the applicant approve their own level; it goes up instead', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'purchaseChain', { amount: 50_000 }, 'li');
    // li's manager wang, then vp; the VP stage would be vp, already covered.
    await decide(h, r.id, 'wang');
    expect((await decide(h, r.id, 'vp')).status).toBe('approved');
  });

  it('stops with an explanation when a level has nobody qualified', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'purchaseChain', { amount: 50_000 }, 'vp');
    // vp's manager is ceo; nobody is two levels up.
    await decide(h, r.id, 'ceo');
    const stuck = request(h, r.id);
    expect(stuck.status).toBe('inReview');
    expect(await active(h, r.id)).toMatchObject({
      key: 'deptManager',
      assignees: [],
    });
    expect((await active(h, r.id))?.notes.at(-1)).toBe(
      'No qualified person could be assigned; an administrator has to reassign it.',
    );
    await h.fire(
      'approvalRequests',
      r.id,
      'reassign',
      { to: 'ceo', reason: 'Board delegate' },
      'admin',
    );
    expect(await assignees(h, r.id)).toEqual(['ceo']);
  });
});
