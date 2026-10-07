// Scenarios 5 (or-sign), 6 (countersign), 7 (voting) and 8 (sequential
// levels): each is a stage policy over task rows, and the
// business record moves only when the stage concludes.
import { describe, expect, it } from 'vitest';

import { ORG } from '../support/services.js';
import {
  committeeApproval,
  committeeLifecycle,
  countersignApproval,
  countersignLifecycle,
  financeApproval,
  financeLifecycle,
  purchaseApproval,
  purchaseLifecycle,
} from '../../server/scenarios/collaboration.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const FINANCE = 'scenarioFinanceRequests';
const COUNTERSIGN = 'scenarioCountersigns';
const COMMITTEE = 'scenarioCommitteeRequests';
const PURCHASE = 'scenarioPurchaseRequests';

function setup(): Harness {
  return createHarness({
    org: ORG,
    lifecycles: [
      financeLifecycle as never,
      countersignLifecycle as never,
      committeeLifecycle as never,
      purchaseLifecycle as never,
    ],
    approvals: [
      financeApproval as never,
      countersignApproval as never,
      committeeApproval as never,
      purchaseApproval as never,
    ],
  });
}

async function submitted(
  h: Harness,
  lifecycle: string,
  values: Record<string, unknown>,
  applicantId = 'zhang',
): Promise<string> {
  const record = await h.create(
    lifecycle,
    { applicantId, ...values },
    applicantId,
  );
  await h.fire(lifecycle, record.id, 'submit', {}, applicantId);
  return String(record.id);
}

/** Where the request is: the stage of its run while one decides. */
const status = (h: Harness, lifecycle: string, id: string): Promise<string> =>
  h.where(lifecycle, id);

describe('scenario 5 · or-sign', () => {
  it('first response decides: the first approval settles it', async () => {
    const h = setup();
    const id = await submitted(h, FINANCE, { mode: 'first' });
    expect(await h.open(FINANCE, id)).toEqual([
      'finA:pending',
      'finB:pending',
      'finC:pending',
    ]);
    await h.answer(FINANCE, id, 'finB');
    expect(await status(h, FINANCE, id)).toBe('approved');
  });

  it('first response decides: the first rejection settles it too', async () => {
    const h = setup();
    const id = await submitted(h, FINANCE, { mode: 'first' });
    await h.answer(FINANCE, id, 'finC', 'reject');
    expect(await status(h, FINANCE, id)).toBe('rejected');
  });

  it('at least one approval: rejections stay in the second layer while someone can still approve', async () => {
    const h = setup();
    const id = await submitted(h, FINANCE, { mode: 'any' });
    const before = h.get(FINANCE, id);
    await h.answer(FINANCE, id, 'finA', 'reject');
    await h.answer(FINANCE, id, 'finB', 'reject');
    // Two answers and not a single write to the request.
    expect(h.get(FINANCE, id)).toBe(before);
    await h.answer(FINANCE, id, 'finC');
    expect(await status(h, FINANCE, id)).toBe('approved');
    expect(
      (await h.tasks(FINANCE, id)).map(
        (task) => `${task.assigneeId}:${task.answer}`,
      ),
    ).toEqual(['finA:reject', 'finB:reject', 'finC:approve']);
  });

  it('at least one approval: rejected once nobody is left to approve', async () => {
    const h = setup();
    const id = await submitted(h, FINANCE, { mode: 'any' });
    for (const person of ['finA', 'finB', 'finC'])
      await h.answer(FINANCE, id, person, 'reject');
    expect(await status(h, FINANCE, id)).toBe('rejected');
  });

  it('two people on the same page: one answer stands, the other finds its task closed', async () => {
    const h = setup();
    const id = await submitted(h, FINANCE, { mode: 'first' });
    const tasks = await h.tasks(FINANCE, id);
    await h.approvals.respond({
      taskId: tasks[0].id,
      actor: { id: 'finA' },
      answer: 'approve',
    });
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: tasks[1].id,
            actor: { id: 'finB' },
            answer: 'reject',
            comment: 'No',
          }),
        )
      ).code,
    ).toBe('TASK_CLOSED');
    expect(
      (await h.tasks(FINANCE, id)).map(
        (task) => `${task.assigneeId}:${task.status}`,
      ),
    ).toEqual(['finA:completed', 'finB:voided', 'finC:voided']);
  });

  it('the remaining people lose the action the moment it settles', async () => {
    const h = setup();
    const id = await submitted(h, FINANCE, { mode: 'any' });
    expect(await h.actions(FINANCE, id, 'finB')).toContain('finB:respond');
    await h.answer(FINANCE, id, 'finA');
    expect(await h.actions(FINANCE, id, 'finB')).toEqual([]);
  });

  it('a repeated click is a replay, not a second vote', async () => {
    const h = setup();
    const id = await submitted(h, FINANCE, { mode: 'any' });
    await h.answer(FINANCE, id, 'finA', 'reject', 'No', {
      requestId: 'click-1',
    });
    const again = await h.answer(FINANCE, id, 'finA', 'reject', 'No', {
      requestId: 'click-1',
    });
    expect(again.outcome).toBe('replayed');
    expect(
      (await h.tasks(FINANCE, id)).filter((task) => task.answer !== null),
    ).toHaveLength(1);
  });
});

describe('scenario 6 · countersign', () => {
  it('needs every reviewer’s approval', async () => {
    const h = setup();
    const id = await submitted(h, COUNTERSIGN, {
      reviewers: null,
      collect: false,
    });
    await h.answer(COUNTERSIGN, id, 'legalA');
    await h.answer(COUNTERSIGN, id, 'legalB');
    expect(await status(h, COUNTERSIGN, id)).toBe('legal');
    await h.answer(COUNTERSIGN, id, 'legalC');
    expect(await status(h, COUNTERSIGN, id)).toBe('approved');
  });

  it('ends at the first rejection by default', async () => {
    const h = setup();
    const id = await submitted(h, COUNTERSIGN, {
      reviewers: null,
      collect: false,
    });
    await h.answer(COUNTERSIGN, id, 'legalA');
    await h.answer(COUNTERSIGN, id, 'legalB', 'reject');
    expect(await status(h, COUNTERSIGN, id)).toBe('rejected');
    expect(await h.open(COUNTERSIGN, id)).toEqual([]);
  });

  it('collects every opinion first when asked to, and still cannot approve', async () => {
    const h = setup();
    const id = await submitted(h, COUNTERSIGN, {
      reviewers: null,
      collect: true,
    });
    await h.answer(COUNTERSIGN, id, 'legalA', 'reject');
    expect(await status(h, COUNTERSIGN, id)).toBe('legalCollect');
    await h.answer(COUNTERSIGN, id, 'legalB');
    await h.answer(COUNTERSIGN, id, 'legalC');
    expect(await status(h, COUNTERSIGN, id)).toBe('rejected');
    expect(
      (await h.tasks(COUNTERSIGN, id)).filter((task) => task.answer !== null),
    ).toHaveLength(3);
  });

  it('counts a person chosen twice once, and says so', async () => {
    const h = setup();
    const id = await submitted(h, COUNTERSIGN, {
      reviewers: ['legalA', 'legalA', 'legalB'],
      collect: false,
    });
    expect(await h.open(COUNTERSIGN, id)).toEqual([
      'legalA:pending',
      'legalB:pending',
    ]);
    expect(
      (await h.events(COUNTERSIGN, id)).map((event) => event.message),
    ).toContain('A person chosen more than once is counted once.');
  });

  it('a departed reviewer blocks rather than approves; a qualified replacement keeps earlier opinions', async () => {
    const h = setup();
    const id = await submitted(h, COUNTERSIGN, {
      reviewers: ['legalA', 'legalB'],
      collect: false,
    });
    await h.answer(COUNTERSIGN, id, 'legalA');
    h.org.deactivate('legalB');
    expect(await status(h, COUNTERSIGN, id)).toBe('legal');
    const unqualified = await h.approvals.reassign({
      from: 'legalB',
      to: 'lawyer',
      actor: { id: 'admin' },
      reason: 'legalB left',
    });
    expect(unqualified.failed[0]?.reason).toContain(
      'does not hold the "legal" role',
    );
    await h.approvals.reassign({
      from: 'legalB',
      to: 'legalC',
      actor: { id: 'admin' },
      reason: 'legalB left',
    });
    await h.answer(COUNTERSIGN, id, 'legalC');
    expect(await status(h, COUNTERSIGN, id)).toBe('approved');
    expect(
      (await h.tasks(COUNTERSIGN, id))
        .filter((task) => task.answer === 'approve')
        .map((task) => task.assigneeId),
    ).toEqual(['legalA', 'legalC']);
  });

  it('an override of the qualification has to be explained', async () => {
    const h = setup();
    const id = await submitted(h, COUNTERSIGN, {
      reviewers: ['legalA'],
      collect: false,
    });
    const task = await h.taskOf(COUNTERSIGN, id, 'legalA');
    const moved = await h.approvals.transfer({
      taskId: task.id,
      actor: { id: 'admin' },
      to: 'lawyer',
      via: 'reassign',
      override: true,
      reason: 'External counsel covers this contract',
    });
    expect(moved).toMatchObject({ assigneeId: 'lawyer', via: 'reassign' });
  });
});

describe('scenario 7 · committee vote, three of five', () => {
  it('two rejections still leave three possible approvals', async () => {
    const h = setup();
    const id = await submitted(h, COMMITTEE, {});
    await h.answer(COMMITTEE, id, 'm1', 'reject');
    await h.answer(COMMITTEE, id, 'm2', 'reject');
    expect(await status(h, COMMITTEE, id)).toBe('committee');
  });

  it('three rejections make three approvals impossible', async () => {
    const h = setup();
    const id = await submitted(h, COMMITTEE, {});
    for (const member of ['m1', 'm2', 'm3'])
      await h.answer(COMMITTEE, id, member, 'reject');
    expect(await status(h, COMMITTEE, id)).toBe('rejected');
  });

  it('settles at the third approval without waiting for the rest', async () => {
    const h = setup();
    const id = await submitted(h, COMMITTEE, {});
    for (const member of ['m1', 'm2', 'm4'])
      await h.answer(COMMITTEE, id, member);
    expect(await status(h, COMMITTEE, id)).toBe('approved');
    expect(await h.open(COMMITTEE, id)).toEqual([]);
  });

  it('abstentions count as cast but not as approval', async () => {
    const h = setup();
    const id = await submitted(h, COMMITTEE, {});
    await h.answer(COMMITTEE, id, 'm1', 'abstain');
    await h.answer(COMMITTEE, id, 'm2', 'abstain');
    await h.answer(COMMITTEE, id, 'm3', 'reject');
    expect(await status(h, COMMITTEE, id)).toBe('rejected');
  });

  it('a vetoer’s rejection ends it at once', async () => {
    const h = setup();
    const id = await submitted(h, COMMITTEE, {});
    for (const member of ['m1', 'm2']) await h.answer(COMMITTEE, id, member);
    await h.answer(COMMITTEE, id, 'm5', 'reject');
    expect(await status(h, COMMITTEE, id)).toBe('rejected');
  });

  it('takes no abstentions where the policy has none', async () => {
    const h = setup();
    const id = await submitted(h, FINANCE, { mode: 'any' });
    expect((await refusal(h.answer(FINANCE, id, 'finA', 'abstain'))).code).toBe(
      'INVALID_ANSWER',
    );
  });
});

describe('scenario 8 · sequential levels', () => {
  it('passes manager → department manager → VP, each a state, each person asked only in turn', async () => {
    const h = setup();
    const id = await submitted(h, PURCHASE, { amount: 50_000 });
    expect(
      (await h.runs(PURCHASE, id))[0].plan
        .filter((entry) => entry.included)
        .map((entry) => entry.stage),
    ).toEqual(['manager', 'deptManager', 'vp']);
    expect(await h.actions(PURCHASE, id, 'wang')).toEqual([]);
    await h.answer(PURCHASE, id, 'li');
    expect(await status(h, PURCHASE, id)).toBe('deptManager');
    await h.answer(PURCHASE, id, 'wang');
    await h.answer(PURCHASE, id, 'vp');
    expect(await status(h, PURCHASE, id)).toBe('approved');
  });

  it('lets one approval cover a later stage held by the same person, and says so in the log', async () => {
    const h = setup();
    // zhao's manager is wang, wang's is vp, and the VP stage is vp again.
    const id = await submitted(h, PURCHASE, { amount: 50_000 }, 'zhao');
    await h.answer(PURCHASE, id, 'wang');
    await h.answer(PURCHASE, id, 'vp');
    expect(await status(h, PURCHASE, id)).toBe('approved');
    const [run] = await h.runs(PURCHASE, id);
    const { transitions } = await h.runtime.history(
      'approval:purchaseChain',
      run.id,
    );
    expect(transitions.at(-1)).toMatchObject({
      transition: 'vp.approve',
      actorId: 'system',
      input: {
        skipped:
          'vp approved "deptManager" this round; that approval covers this stage.',
      },
    });
  });

  it('never lets the applicant approve their own level; it goes up instead', async () => {
    const h = setup();
    const id = await submitted(h, PURCHASE, { amount: 50_000 }, 'li');
    await h.answer(PURCHASE, id, 'wang');
    await h.answer(PURCHASE, id, 'vp');
    expect(await status(h, PURCHASE, id)).toBe('approved');
  });

  it('holds a level nobody qualifies for, with the reason, until an administrator appoints someone', async () => {
    const h = setup();
    const id = await submitted(h, PURCHASE, { amount: 50_000 }, 'vp');
    await h.answer(PURCHASE, id, 'ceo');
    expect(await status(h, PURCHASE, id)).toBe('deptManager');
    expect(await h.open(PURCHASE, id)).toEqual([]);
    expect(
      (await h.events(PURCHASE, id))
        .filter((event) => event.stage === 'deptManager')
        .map((event) => event.message),
    ).toEqual([
      'No qualified person could be assigned; an administrator has to assign someone.',
      'Waiting for an administrator to assign someone.',
    ]);
    await h.approvals.appoint({
      approval: 'purchaseChain',
      lifecycle: PURCHASE,
      recordId: id,
      to: 'ceo',
      actor: { id: 'admin' },
      reason: 'Board delegate',
    });
    expect(await h.open(PURCHASE, id)).toEqual(['ceo:pending']);
  });
});
