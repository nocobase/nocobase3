// Scenarios 14 (hand over and add signers), 15 (delegation) and 16
// (reassignment after someone leaves): all of it task rows.
import { describe, expect, it } from 'vitest';

import { ORG } from '../support/services.js';
import type { Delegation } from '../support/org.js';
import {
  financeApproval,
  financeLifecycle,
} from '../../server/scenarios/collaboration.js';
import {
  expenseApproval,
  expenseLifecycle,
  legalReviewApproval,
  legalReviewLifecycle,
  paymentApproval,
  paymentApprovalLifecycle,
} from '../../server/scenarios/responsibility.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const LEGAL = 'scenarioLegalReviews';
const EXPENSE = 'scenarioExpenses';
const PAYMENT = 'scenarioPaymentApprovals';
const FINANCE = 'scenarioFinanceRequests';

function setup(now?: string): Harness {
  return createHarness({
    org: ORG,
    ...(now ? { now } : {}),
    lifecycles: [
      legalReviewLifecycle as never,
      expenseLifecycle as never,
      paymentApprovalLifecycle as never,
      financeLifecycle as never,
    ],
    approvals: [
      legalReviewApproval as never,
      expenseApproval as never,
      paymentApproval as never,
      financeApproval as never,
    ],
  });
}

async function submitted(
  h: Harness,
  lifecycle: string,
  values: Record<string, unknown> = {},
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

async function add(
  h: Harness,
  id: string,
  by: string,
  person: string,
  mode: 'before' | 'after' | 'alongside',
) {
  const task = await h.taskOf(LEGAL, id, by);
  return h.approvals.addSigner({
    taskId: task.id,
    actor: { id: by },
    person,
    mode,
  });
}

describe('scenario 14 · hand over and add signers', () => {
  it('hand over: A no longer holds it, B decides; the new row names the one it replaced', async () => {
    const h = setup();
    const id = await submitted(h, LEGAL);
    const before = h.get(LEGAL, id);
    const task = await h.taskOf(LEGAL, id, 'legalA');
    const next = await h.approvals.transfer({
      taskId: task.id,
      actor: { id: 'legalA' },
      to: 'lawyer',
      reason: 'Needs a specialist',
    });
    expect(next).toMatchObject({
      assigneeId: 'lawyer',
      via: 'transfer',
      previousTaskId: task.id,
    });
    expect(h.get(LEGAL, id)).toBe(before);
    expect((await refusal(h.answer(LEGAL, id, 'legalA'))).code).toBe(
      'TASK_CLOSED',
    );
    await h.answer(LEGAL, id, 'lawyer');
    expect(await h.stage(LEGAL, id)).toBe('legalLead');
  });

  it('add before: B decides first, then it comes back to A', async () => {
    const h = setup();
    const id = await submitted(h, LEGAL);
    await add(h, id, 'legalA', 'lawyer', 'before');
    expect(await h.open(LEGAL, id)).toEqual([
      'legalA:blocked',
      'lawyer:pending',
    ]);
    expect((await refusal(h.answer(LEGAL, id, 'legalA'))).code).toBe(
      'NOT_YOUR_TURN',
    );
    await h.answer(LEGAL, id, 'lawyer');
    expect(await h.open(LEGAL, id)).toEqual(['legalA:pending']);
    await h.answer(LEGAL, id, 'legalA');
    expect(await h.stage(LEGAL, id)).toBe('legalLead');
  });

  it('add after: A approves, and B must approve too', async () => {
    const h = setup();
    const id = await submitted(h, LEGAL);
    await add(h, id, 'legalA', 'lawyer', 'after');
    await h.answer(LEGAL, id, 'legalA');
    expect(await h.open(LEGAL, id)).toEqual(['lawyer:pending']);
    await h.answer(LEGAL, id, 'lawyer');
    expect(await h.stage(LEGAL, id)).toBe('legalLead');
  });

  it('add alongside: A and B both have to approve', async () => {
    const h = setup();
    const id = await submitted(h, LEGAL);
    await add(h, id, 'legalA', 'lawyer', 'alongside');
    await h.answer(LEGAL, id, 'legalA');
    expect(await h.stage(LEGAL, id)).toBe('legal');
    await h.answer(LEGAL, id, 'lawyer');
    expect(await h.stage(LEGAL, id)).toBe('legalLead');
  });

  it('an approval that takes no added signers refuses them', async () => {
    const h = setup();
    const id = await submitted(h, EXPENSE);
    const task = await h.taskOf(EXPENSE, id, 'li');
    expect(
      (
        await refusal(
          h.approvals.addSigner({
            taskId: task.id,
            actor: { id: 'li' },
            person: 'wang',
            mode: 'after',
          }),
        )
      ).code,
    ).toBe('NOT_ALLOWED');
  });

  it('an added signer may not add another: the depth is limited by the approval', async () => {
    const h = setup();
    const id = await submitted(h, LEGAL);
    await add(h, id, 'legalA', 'lawyer', 'before');
    expect((await refusal(add(h, id, 'lawyer', 'legalB', 'before'))).code).toBe(
      'NOT_ALLOWED',
    );
  });
});

describe('scenario 15 · delegation while away', () => {
  function away(h: Harness, overrides: Partial<Delegation> = {}): void {
    h.org.delegate({
      from: 'li',
      to: 'wang',
      start: '2026-10-01T00:00:00Z',
      end: '2026-10-15T00:00:00Z',
      kinds: [],
      coversExisting: true,
      createdAt: '2026-09-30T00:00:00Z',
      ...overrides,
    });
  }

  it('the delegate answers for the principal, and both are recorded', async () => {
    const h = setup();
    away(h);
    const id = await submitted(h, EXPENSE);
    expect(await h.actions(EXPENSE, id, 'wang')).toEqual(['li:respond']);
    await h.answer(EXPENSE, id, 'wang');
    expect(h.get(EXPENSE, id).status).toBe('approved');
    const [task] = await h.tasks(EXPENSE, id);
    expect(task).toMatchObject({ assigneeId: 'li', actorId: 'wang' });
    const { transitions } = await h.runtime.history(EXPENSE, id);
    expect(transitions.at(-1)).toMatchObject({
      actorId: 'wang',
      input: { onBehalfOf: 'li' },
    });
  });

  it('a delegation for new work only does not reach older work', async () => {
    const h = setup('2026-09-29T09:00:00Z');
    const id = await submitted(h, EXPENSE);
    h.advance({ days: 3 });
    away(h, { coversExisting: false });
    expect((await refusal(h.answer(EXPENSE, id, 'wang'))).code).toBe(
      'NOT_ASSIGNEE',
    );
  });

  it('covers only the kinds it names', async () => {
    const h = setup();
    away(h, { kinds: ['purchaseChain'] });
    const id = await submitted(h, EXPENSE);
    expect((await refusal(h.answer(EXPENSE, id, 'wang'))).code).toBe(
      'NOT_ASSIGNEE',
    );
  });

  it('does not chain: the delegate’s own delegate cannot act for the principal', async () => {
    const h = setup();
    away(h);
    h.org.delegate({
      from: 'wang',
      to: 'vp',
      start: '2026-10-01T00:00:00Z',
      end: '2026-10-15T00:00:00Z',
      kinds: [],
      coversExisting: true,
      createdAt: '2026-09-30T00:00:00Z',
    });
    const id = await submitted(h, EXPENSE);
    expect((await refusal(h.answer(EXPENSE, id, 'vp'))).code).toBe(
      'NOT_ASSIGNEE',
    );
  });

  it('stops when it expires, checked at the moment of acting', async () => {
    const h = setup();
    away(h);
    const id = await submitted(h, EXPENSE);
    expect(await h.actions(EXPENSE, id, 'wang')).toEqual(['li:respond']);
    h.advance({ days: 20 });
    expect(await h.actions(EXPENSE, id, 'wang')).toEqual([]);
  });

  it('never lets the applicant decide their own request as a delegate', async () => {
    const h = setup();
    away(h, { to: 'zhang' });
    const id = await submitted(h, EXPENSE);
    expect((await refusal(h.answer(EXPENSE, id, 'zhang'))).code).toBe(
      'NOT_ASSIGNEE',
    );
  });

  it('a delegate may decide but not hand the responsibility on', async () => {
    const h = setup();
    away(h);
    const id = await submitted(h, EXPENSE);
    const task = await h.taskOf(EXPENSE, id, 'li');
    expect(
      (
        await refusal(
          h.approvals.transfer({
            taskId: task.id,
            actor: { id: 'wang' },
            to: 'zhao',
            reason: 'x',
          }),
        )
      ).code,
    ).toBe('NOT_ASSIGNEE');
  });
});

describe('scenario 16 · reassignment after someone leaves', () => {
  it('moves every open task of a departed approver; an answer already given stays where it is', async () => {
    const h = setup();
    const items = [
      await submitted(h, PAYMENT),
      await submitted(h, PAYMENT),
      await submitted(h, PAYMENT),
      await submitted(h, PAYMENT),
    ];
    const decided = await submitted(h, FINANCE, { mode: 'any' });
    await h.answer(FINANCE, decided, 'finA', 'reject');
    h.org.deactivate('finA');
    const report = await h.approvals.reassign({
      from: 'finA',
      to: 'finB',
      actor: { id: 'admin' },
      reason: 'finA left',
    });
    expect(report.moved).toHaveLength(4);
    expect(report.failed).toEqual([]);
    for (const id of items)
      expect(await h.open(PAYMENT, id)).toEqual(['finB:pending']);
    expect(
      (await h.tasks(FINANCE, decided)).find(
        (task) => task.assigneeId === 'finA',
      ),
    ).toMatchObject({ status: 'completed', answer: 'reject' });
  });

  it('a retried batch moves nothing twice: what moved is no longer finA’s', async () => {
    const h = setup();
    const id = await submitted(h, PAYMENT);
    const reassign = () =>
      h.approvals.reassign({
        from: 'finA',
        to: 'finB',
        actor: { id: 'admin' },
        reason: 'left',
      });
    expect((await reassign()).moved).toHaveLength(1);
    expect((await reassign()).moved).toHaveLength(0);
    expect(await h.open(PAYMENT, id)).toEqual(['finB:pending']);
  });

  it('the right to reassign is not the right to approve, and an approver may not reassign', async () => {
    const h = setup();
    const id = await submitted(h, PAYMENT);
    expect((await refusal(h.answer(PAYMENT, id, 'admin'))).code).toBe(
      'NOT_ASSIGNEE',
    );
    const task = await h.taskOf(PAYMENT, id, 'finA');
    expect(
      (
        await refusal(
          h.approvals.transfer({
            taskId: task.id,
            actor: { id: 'finA' },
            to: 'finB',
            via: 'reassign',
            reason: 'x',
          }),
        )
      ).code,
    ).toBe('NOT_ALLOWED');
  });

  it('refuses an unqualified replacement unless the override is explicit and explained', async () => {
    const h = setup();
    const id = await submitted(h, PAYMENT);
    const plain = await h.approvals.reassign({
      from: 'finA',
      to: 'zhao',
      actor: { id: 'admin' },
      reason: 'left',
    });
    expect(plain.failed[0]?.reason).toContain(
      'does not hold the "finance" role',
    );
    await h.approvals.reassign({
      from: 'finA',
      to: 'zhao',
      actor: { id: 'admin' },
      reason: 'left, CFO approved',
      override: true,
    });
    expect((await h.tasks(PAYMENT, id)).at(-1)).toMatchObject({
      assigneeId: 'zhao',
      note: 'Reassigned by admin: left, CFO approved (qualification overridden)',
    });
  });

  it('reassignment and the original approver’s answer racing: one wins', async () => {
    const h = setup();
    const id = await submitted(h, PAYMENT);
    const task = await h.taskOf(PAYMENT, id, 'finA');
    await h.answer(PAYMENT, id, 'finA');
    expect(
      (
        await refusal(
          h.approvals.transfer({
            taskId: task.id,
            actor: { id: 'admin' },
            to: 'finB',
            via: 'reassign',
            reason: 'left',
          }),
        )
      ).code,
    ).toBe('TASK_CLOSED');
    expect(h.get(PAYMENT, id).status).toBe('approved');
  });

  it('an idle approver is passed up after the configured wait, and the record does not move', async () => {
    const h = setup();
    const id = await submitted(h, EXPENSE);
    const before = h.get(EXPENSE, id);
    h.advance({ hours: 73 });
    expect(await h.approvals.sweep()).toBe(1);
    expect((await h.tasks(EXPENSE, id)).at(-1)).toMatchObject({
      assigneeId: 'wang',
      via: 'escalate',
    });
    expect(h.get(EXPENSE, id)).toBe(before);
  });
});
