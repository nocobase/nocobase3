// Scenario 23: a reimbursement decided line by line, one task
// per line, the sheet moving once every line is decided.
import { describe, expect, it } from 'vitest';

import {
  REIMBURSEMENTS,
  reimbursementApproval,
  reimbursementLifecycle,
  requestRejectedLinesAgain,
  type LineContent,
  type Reimbursement,
} from '../../server/scenarios/reimbursement.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const R = REIMBURSEMENTS;
const ORG = {
  people: ['alice', 'bob', 'tina', 'ivan', 'fiona'],
  managers: { alice: 'bob' },
  roles: { travelApprover: ['tina'], itApprover: ['ivan'], finance: ['fiona'] },
};

function setup(overrides: Record<string, unknown> = {}) {
  const parameters: Record<string, unknown> = {
    routing: 'byCategory',
    categoryRoles: { travel: 'travelApprover', equipment: 'itApprover' },
    ...overrides,
  };
  const h = createHarness({
    org: ORG,
    lifecycles: [reimbursementLifecycle as never],
    approvals: [reimbursementApproval as never],
    parameters: { [R]: parameters },
  });
  return { h, parameters };
}

const line = (
  id: string,
  category: string,
  amountCents: number,
): LineContent => ({
  id,
  category,
  description: `${category} ${id}`,
  amountCents,
});

async function submitted(h: Harness, lines: LineContent[]): Promise<string> {
  const record = await h.create(
    R,
    {
      title: 'Trip to Shanghai',
      applicantId: 'alice',
      lines,
      decisions: null,
      approvedTotalCents: 0,
      payments: null,
      paymentError: null,
      followUpOf: null,
    },
    'alice',
  );
  await h.fire(R, record.id, 'submit', {}, 'alice');
  return String(record.id);
}

const sheet = (h: Harness, id: string): Reimbursement =>
  h.get(R, id) as Reimbursement;

/** `person` decides one line, on the task the line is in. */
async function decide(
  h: Harness,
  id: string,
  lineId: string,
  answer: 'approve' | 'reject' | 'return',
  person: string,
  data: Record<string, number> = {},
): Promise<Reimbursement> {
  const task = (await h.tasks(R, id)).filter(
    (each) =>
      each.subject === lineId &&
      (each.status === 'pending' || each.status === 'claimed'),
  )[0];
  if (!task) throw new Error(`No open task for line ${lineId}.`);
  await h.approvals.respond({
    taskId: task.id,
    actor: { id: person },
    answer,
    ...(answer === 'approve' ? {} : { comment: 'See policy.' }),
    data,
  });
  return sheet(h, id);
}

async function states(h: Harness, id: string): Promise<string[]> {
  return (await h.runtime.history(R, id)).transitions.map((entry) => entry.to);
}

describe('scenario 23 · itemized reimbursement', () => {
  it('a single approver decides every line at once, bound to the sheet’s content', async () => {
    const { h } = setup({ routing: 'single' });
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    expect(await h.open(R, id)).toEqual(['bob:pending', 'bob:pending']);
    const shown = (await h.runs(R, id))[0].contentHash;
    expect(
      (
        await refusal(
          h.approvals.respondAll({
            lifecycle: R,
            recordId: id,
            actor: { id: 'bob' },
            answer: 'approve',
            contentHash: 'stale',
          }),
        )
      ).code,
    ).toBe('STALE_CONTENT');
    await h.approvals.respondAll({
      lifecycle: R,
      recordId: id,
      actor: { id: 'bob' },
      answer: 'approve',
      contentHash: shown,
    });
    expect(await states(h, id)).toEqual([
      'draft',
      'approving',
      'approved',
      'paid',
    ]);
    expect(sheet(h, id)).toMatchObject({
      approvedTotalCents: 80_000,
      payments: { t1: 'PAY-1', e1: 'PAY-2' },
    });
  });

  it('without partial approval, one rejected line rejects the whole sheet at once', async () => {
    const { h } = setup({ allowPartialApproval: false });
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    expect((await decide(h, id, 'e1', 'reject', 'ivan')).status).toBe(
      'rejected',
    );
    expect(await h.open(R, id)).toEqual([]);
    expect(h.external.payments.size).toBe(0);
  });

  it('approves 8 of 10 lines: partially approved, with the approved total, paying only the approved lines', async () => {
    const { h } = setup();
    const lines = [
      ...[1, 2, 3, 4, 5].map((n) => line(`t${n}`, 'travel', n * 1_000)),
      ...[1, 2, 3, 4, 5].map((n) => line(`e${n}`, 'equipment', n * 10_000)),
    ];
    const id = await submitted(h, lines);
    const before = sheet(h, id);
    for (const n of [1, 2, 3, 4, 5])
      await decide(h, id, `t${n}`, 'approve', 'tina');
    for (const n of [1, 2, 3]) await decide(h, id, `e${n}`, 'approve', 'ivan');
    await decide(h, id, 'e4', 'reject', 'ivan');
    // Nine answers by two people and not one write to the sheet.
    expect(sheet(h, id)).toBe(before);
    const done = await decide(h, id, 'e5', 'reject', 'ivan');
    expect(await states(h, id)).toContain('partiallyApproved');
    expect(done).toMatchObject({
      status: 'paid',
      approvedTotalCents: 15_000 + 60_000,
    });
    expect(h.external.payments.size).toBe(8);
  });

  it('an approver may approve less than claimed, never more', async () => {
    const { h } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    expect(
      (
        await refusal(
          decide(h, id, 't1', 'approve', 'tina', { approvedCents: 40_000 }),
        )
      ).code,
    ).toBe('INVALID_ANSWER');
    await decide(h, id, 't1', 'approve', 'tina', { approvedCents: 20_000 });
    const done = await decide(h, id, 'e1', 'approve', 'ivan');
    expect(done.approvedTotalCents).toBe(70_000);
    expect(
      [...h.external.payments.values()].map((p) => p.amountCents).sort(),
    ).toEqual([20_000, 50_000]);
  });

  it('every line rejected settles the sheet as rejected; a rejection or a return needs a reason', async () => {
    const { h } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    const [first] = await h.tasks(R, id);
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: first.id,
            actor: { id: 'tina' },
            answer: 'return',
          }),
        )
      ).code,
    ).toBe('INVALID_ANSWER');
    await decide(h, id, 't1', 'reject', 'tina');
    expect(await decide(h, id, 'e1', 'reject', 'ivan')).toMatchObject({
      status: 'rejected',
      approvedTotalCents: 0,
    });
  });

  it('routes each line by category and tells each approver once per line', async () => {
    const { h } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
      line('m1', 'meals', 8_000),
    ]);
    expect(
      (await h.tasks(R, id)).map(
        (task) => `${task.subject}:${task.assigneeId}`,
      ),
    ).toEqual(['t1:tina', 'e1:ivan', 'm1:bob']);
    expect(h.messagesTo('tina')).toEqual([
      `To decide: reimbursement ${id} / t1`,
    ]);
    expect(h.messagesTo('bob')).toEqual([
      `To decide: reimbursement ${id} / m1`,
    ]);
  });

  it("one approver cannot decide another approver's line, and each sees exactly the lines waiting for them", async () => {
    const { h } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    expect((await refusal(decide(h, id, 'e1', 'approve', 'tina'))).code).toBe(
      'NOT_ASSIGNEE',
    );
    expect(await h.actions(R, id, 'tina')).toEqual([
      'tina:respond',
      'tina:returnTo',
      'tina:transfer',
    ]);
    await decide(h, id, 't1', 'approve', 'tina');
    expect(await h.actions(R, id, 'tina')).toEqual([]);
    expect(
      (await h.approvals.actionsFor(R, id, { id: 'ivan' })).map(
        (each) => each.task.subject,
      ),
    ).toEqual(['e1']);
  });

  it('a line nobody can decide refuses the submission instead of passing it', async () => {
    const { h } = setup();
    h.org.deactivate('tina');
    const record = await h.create(
      R,
      {
        title: 'Trip',
        applicantId: 'alice',
        lines: [line('t1', 'travel', 30_000)],
        decisions: null,
        approvedTotalCents: 0,
        payments: null,
        paymentError: null,
        followUpOf: null,
      },
      'alice',
    );
    expect(
      (await refusal(h.fire(R, record.id, 'submit', {}, 'alice'))).code,
    ).toBe('NO_ASSIGNEE');
    expect(h.get(R, record.id).status).toBe('draft');
  });

  it('approvers of different lines no longer conflict: each answers a task of their own', async () => {
    const { h } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    const [tina, ivan] = await h.tasks(R, id);
    // Both pages were loaded together; both answers stand.
    await h.approvals.respond({
      taskId: tina.id,
      actor: { id: 'tina' },
      answer: 'approve',
    });
    await h.approvals.respond({
      taskId: ivan.id,
      actor: { id: 'ivan' },
      answer: 'approve',
    });
    expect(sheet(h, id).status).toBe('paid');
  });

  it('returned lines go back to the applicant while the other decisions stand', async () => {
    const { h } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    await decide(h, id, 'e1', 'return', 'ivan');
    expect(await h.stage(R, id)).toBe('lineReview');
    await decide(h, id, 't1', 'approve', 'tina');
    expect(sheet(h, id)).toMatchObject({
      status: 'returned',
      decisions: { t1: { outcome: 'approve' }, e1: { outcome: 'return' } },
    });
    await h.fire(
      R,
      id,
      'resubmit',
      {
        lines: [
          {
            id: 'e1',
            category: 'equipment',
            description: 'Monitor, with receipt',
            amountCents: 45_000,
          },
        ],
      },
      'alice',
    );
    expect(await h.stage(R, id)).toBe('lineReview');
    const second = (await h.runs(R, id))[1].id;
    expect(
      (await h.tasks(R, id))
        .filter((task) => task.runId === second)
        .map((task) => `${task.subject}:${task.status}`),
    ).toEqual(['t1:completed', 'e1:pending']);
    expect(h.messagesTo('ivan')).toHaveLength(2);
    expect(h.messagesTo('tina')).toHaveLength(1);
    expect(await decide(h, id, 'e1', 'approve', 'ivan')).toMatchObject({
      status: 'paid',
      approvedTotalCents: 75_000,
    });
  });

  it('only returned lines can be changed on resubmission, and a returned line can be dropped', async () => {
    const { h } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    await decide(h, id, 't1', 'approve', 'tina');
    await decide(h, id, 'e1', 'return', 'ivan');
    await expect(
      h.fire(
        R,
        id,
        'resubmit',
        {
          lines: [
            {
              id: 't1',
              category: 'travel',
              description: 'More',
              amountCents: 90_000,
            },
          ],
        },
        'alice',
      ),
    ).rejects.toMatchObject({ blockers: [{ code: 'notReturned' }] });
    await h.fire(R, id, 'resubmit', { drop: ['e1'] }, 'alice');
    // Everything left was decided last round: the stage concludes as it opens.
    expect(sheet(h, id).lines.map((each) => each.id)).toEqual(['t1']);
    expect(await states(h, id)).toEqual([
      'draft',
      'approving',
      'returned',
      'approving',
      'approved',
      'paid',
    ]);
  });

  it('with retained decisions turned off at submission, a return sends every line back', async () => {
    const { h } = setup({ retainDecisionsOnReturn: false });
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    await decide(h, id, 't1', 'approve', 'tina');
    await decide(h, id, 'e1', 'return', 'ivan');
    await h.fire(
      R,
      id,
      'resubmit',
      {
        lines: [
          {
            id: 'e1',
            category: 'equipment',
            description: 'Monitor',
            amountCents: 45_000,
          },
        ],
      },
      'alice',
    );
    expect(await h.open(R, id)).toEqual(['tina:pending', 'ivan:pending']);
  });

  it('every decision keeps the line content hash, the run and the decider; an edit outside the lifecycle cannot be decided', async () => {
    const { h } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    await decide(h, id, 't1', 'approve', 'tina');
    const [decided] = await h.tasks(R, id);
    expect(decided).toMatchObject({
      actorId: 'tina',
      answer: 'approve',
      data: { hash: expect.any(String) },
    });
    h.store.patchRecord(R, id, {
      lines: sheet(h, id).lines.map((each) => ({
        ...each,
        amountCents: 99_000,
      })),
    });
    expect((await refusal(decide(h, id, 'e1', 'approve', 'ivan'))).code).toBe(
      'CONTENT_CHANGED',
    );
  });

  it('rules frozen at submission: a parameter change later does not reach the sheet', async () => {
    const { h, parameters } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    parameters.allowPartialApproval = false;
    await decide(h, id, 't1', 'reject', 'tina');
    await decide(h, id, 'e1', 'approve', 'ivan');
    expect(await states(h, id)).toContain('partiallyApproved');
  });

  it('a rejection is final on its sheet; the applicant asks again with a new sheet, created in one transaction', async () => {
    const { h } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    await decide(h, id, 't1', 'approve', 'tina');
    await decide(h, id, 'e1', 'reject', 'ivan');
    const again = String(
      await requestRejectedLinesAgain(h.runtime, id, 'alice'),
    );
    expect(sheet(h, again)).toMatchObject({ status: 'draft', followUpOf: id });
    expect(await h.history(R, again)).toEqual(['$create']);
    await h.fire(R, again, 'submit', {}, 'alice');
    expect((await decide(h, again, 'e1', 'approve', 'ivan')).status).toBe(
      'paid',
    );
  });

  it('a payment that fails part-way pays no line twice when finance retries', async () => {
    const { h } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    h.external.balanceCents = 40_000;
    await decide(h, id, 't1', 'approve', 'tina');
    expect((await decide(h, id, 'e1', 'approve', 'ivan')).status).toBe(
      'paymentFailed',
    );
    h.external.balanceCents = 100_000;
    await h.fire(R, id, 'retryPayment', {}, 'fiona');
    expect(sheet(h, id)).toMatchObject({
      status: 'paid',
      payments: { t1: 'PAY-1', e1: 'PAY-2' },
    });
    expect(h.external.balanceCents).toBe(50_000);
  });

  it('each line is reminded by its own idle time: a decision on one line restarts nobody else’s clock', async () => {
    const { h } = setup();
    const id = await submitted(h, [
      line('t1', 'travel', 30_000),
      line('e1', 'equipment', 50_000),
    ]);
    h.advance({ hours: 20 });
    await decide(h, id, 't1', 'approve', 'tina');
    h.advance({ hours: 5 });
    expect(await h.approvals.sweep()).toBe(1);
    expect(
      h.messagesTo('ivan').filter((subject) => subject.startsWith('Reminder')),
    ).toHaveLength(1);
    expect(
      h.messagesTo('tina').filter((subject) => subject.startsWith('Reminder')),
    ).toEqual([]);
  });
});
