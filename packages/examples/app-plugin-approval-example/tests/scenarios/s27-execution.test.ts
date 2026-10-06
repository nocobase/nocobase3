// Scenario 27: the decision is an approval stage; execution
// stays the payment request's own first layer.
import { SYSTEM_ACTOR } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  executeDuePayments,
  PAYMENT_RESERVATIONS,
  paymentApproval,
  paymentKey,
  paymentLifecycle,
  PAYMENTS,
  type PaymentRequest,
} from '../../server/scenarios/payment.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const P = PAYMENTS;

function setup(budgetCents = 10_000_000): Harness {
  return createHarness({
    org: {
      people: ['alice', 'fiona', 'tom', 'bob'],
      roles: { financeApprover: ['fiona'], treasurer: ['tom'] },
    },
    lifecycles: [paymentLifecycle as never],
    approvals: [paymentApproval as never],
    parameters: { [P]: { budgetCents } },
  });
}

interface Draft {
  readonly amountCents?: number;
  readonly executionMode?: 'immediate' | 'scheduled';
  readonly installments?: number;
  readonly applicantId?: string;
}

async function drafted(h: Harness, draft: Draft = {}): Promise<string> {
  const applicant = draft.applicantId ?? 'alice';
  const record = await h.create(
    P,
    {
      title: 'Laptop',
      applicantId: applicant,
      payeeId: 'vendor-1',
      amountCents: draft.amountCents ?? 300_000,
      budgetCode: 'IT',
      executionMode: draft.executionMode ?? 'immediate',
      installments: draft.installments ?? 1,
      approvedAt: null,
      approvedBy: null,
      approvedSnapshot: null,
      paidCents: 0,
      installmentsPaid: 0,
    },
    applicant,
  );
  return String(record.id);
}

async function submitted(h: Harness, draft: Draft = {}): Promise<string> {
  const id = await drafted(h, draft);
  await h.fire(P, id, 'submit', {}, draft.applicantId ?? 'alice');
  return id;
}

async function approved(h: Harness, draft: Draft = {}): Promise<string> {
  const id = await submitted(h, draft);
  await h.answer(P, id, 'fiona');
  return id;
}

const record = (h: Harness, id: string): PaymentRequest =>
  h.get(P, id) as PaymentRequest;
const ledger = (h: Harness) =>
  h.store
    .records(PAYMENT_RESERVATIONS)
    .map((row) => ({ kind: row.kind, amountCents: row.amountCents }));
const payCalls = (h: Harness): string[] =>
  h.external.calls.filter((call) => call.startsWith('pay:'));
const services = (h: Harness) =>
  ({
    records: {
      list: (collection: string, where: (row: never) => boolean) =>
        Promise.resolve(h.store.records(collection).filter(where as never)),
    },
  }) as never;

describe('scenario 27 · execute immediately', () => {
  it('approval and execution are recorded separately; the reservation is consumed', async () => {
    const h = setup();
    const id = await approved(h);
    expect(record(h, id)).toMatchObject({
      status: 'executed',
      approvedBy: 'fiona',
      approvedSnapshot: { payeeId: 'vendor-1', amountCents: 300_000 },
      paidCents: 300_000,
      paymentRefs: ['PAY-1'],
      reservationStatus: 'consumed',
    });
    expect(await h.history(P, id)).toEqual([
      '$create',
      'submit',
      'approve',
      'executeNow',
      'paid',
    ]);
    expect(h.messagesTo('alice')).toEqual(['Payment executed: Laptop']);
  });

  it('the applicant cannot approve their own request, and only the assigned approver can', async () => {
    const h = setup();
    h.org.grantRole('alice', 'financeApprover');
    const id = await submitted(h);
    expect((await refusal(h.answer(P, id, 'alice'))).code).toBe('NOT_ASSIGNEE');
    expect((await refusal(h.answer(P, id, 'tom'))).code).toBe('NOT_ASSIGNEE');
    expect(await h.open(P, id)).toEqual(['fiona:pending']);
  });
});

describe('scenario 27 · a person chooses when to execute', () => {
  it('approved waits; a treasurer schedules it; the sweep executes it once it is due', async () => {
    const h = setup();
    const id = await approved(h, { executionMode: 'scheduled' });
    expect(record(h, id).status).toBe('approved');
    const at = new Date(h.now().getTime() + 2 * 86_400_000).toISOString();
    await expect(
      h.fire(P, id, 'schedule', { executeAt: at }, 'alice'),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    await h.fire(P, id, 'schedule', { executeAt: at }, 'tom');
    expect(await executeDuePayments(h.runtime, services(h), h.now())).toEqual({
      executed: [],
      refused: [],
    });
    await expect(
      h.fire(P, id, 'execute', {}, SYSTEM_ACTOR),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    h.advance({ days: 2 });
    expect(
      (await executeDuePayments(h.runtime, services(h), h.now())).executed,
    ).toEqual([record(h, id).id]);
    expect(record(h, id)).toMatchObject({ status: 'executed', executeAt: at });
  });

  it('a treasurer may execute by hand before its date; an approver cannot', async () => {
    const h = setup();
    const id = await approved(h, { executionMode: 'scheduled' });
    await expect(h.fire(P, id, 'execute', {}, 'fiona')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    await h.fire(P, id, 'execute', {}, 'tom');
    expect(record(h, id).status).toBe('executed');
  });
});

describe('scenario 27 · insufficient balance and lost responses', () => {
  it('a decline is not retried; executionFailed keeps the approval and the reservation; a treasurer retries once funded', async () => {
    const h = setup();
    h.external.balanceCents = 100;
    const id = await approved(h);
    expect(record(h, id)).toMatchObject({
      status: 'executionFailed',
      failureKind: 'declined',
      approvedBy: 'fiona',
      reservationStatus: 'held',
    });
    expect(payCalls(h)).toHaveLength(1);
    h.external.balanceCents = 1_000_000;
    await expect(
      h.fire(P, id, 'retryExecution', {}, 'alice'),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    await h.fire(P, id, 'retryExecution', {}, 'tom');
    expect(record(h, id)).toMatchObject({
      status: 'executed',
      failureKind: null,
      approvedBy: 'fiona',
    });
  });

  it('the retry sends the same business key and finds the payment: paid once', async () => {
    const h = setup();
    h.external.loseNextPaymentResponse = true;
    const id = await approved(h);
    expect(record(h, id)).toMatchObject({
      status: 'executed',
      paymentRefs: ['PAY-1'],
    });
    const key = paymentKey(record(h, id), 1);
    expect(payCalls(h)).toEqual([`pay:${key}`, `pay:${key}`]);
  });

  it('when the retries run out the outcome is unknown: reconciling looks the key up and finds the payment', async () => {
    const h = setup();
    const real = h.external.pay.bind(h.external);
    let calls = 0;
    h.external.pay = (key, payee, amountCents) => {
      calls += 1;
      if (calls === 1) {
        real(key, payee, amountCents);
        throw new Error('Connection reset.');
      }
      throw new Error('Provider unavailable.');
    };
    const id = await approved(h);
    expect(record(h, id)).toMatchObject({
      status: 'executed',
      paymentRefs: ['PAY-1'],
    });
    expect(h.external.payments.size).toBe(1);
  });

  it('while the outcome is unknown, a treasurer can only reconcile again', async () => {
    const h = setup();
    h.external.pay = () => {
      throw new Error('Provider unavailable.');
    };
    const realFind = h.external.findPayment.bind(h.external);
    h.external.findPayment = () => {
      throw new Error('Lookup unavailable.');
    };
    const id = await approved(h);
    expect(record(h, id).status).toBe('reconciling');
    expect(await h.allowed(P, id, 'tom')).toEqual(['reconcileAgain']);
    h.external.findPayment = realFind;
    await h.fire(P, id, 'reconcileAgain', {}, 'tom');
    expect(record(h, id)).toMatchObject({
      status: 'executionFailed',
      failureKind: 'notExecuted',
    });
  });
});

describe('scenario 27 · installments and reservations', () => {
  it('a decline on the second installment leaves it partly paid; terminating releases only the unpaid part', async () => {
    const h = setup(1_000_000);
    h.external.balanceCents = 100_000;
    const id = await approved(h, { installments: 3 });
    expect(record(h, id)).toMatchObject({
      status: 'executionFailed',
      installmentsPaid: 1,
      paidCents: 100_000,
    });
    await expect(
      h.fire(P, id, 'requestReapproval', { reason: 'x' }, 'alice'),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'partlyPaid' })],
    });
    await h.fire(P, id, 'terminate', { reason: 'Vendor dispute.' }, 'tom');
    expect(record(h, id)).toMatchObject({
      status: 'terminated',
      reservationStatus: 'partiallyConsumed',
    });
    expect(ledger(h)).toEqual([
      { kind: 'reserve', amountCents: 300_000 },
      { kind: 'release', amountCents: 200_000 },
    ]);
  });

  it('submitting reserves the amount; beyond the budget it is refused with a reason', async () => {
    const h = setup(500_000);
    await submitted(h);
    const second = await drafted(h, { applicantId: 'bob' });
    expect(
      (await h.runtime.can(P, second, 'submit', { id: 'bob' })).blockers,
    ).toEqual([expect.objectContaining({ code: 'budgetExhausted' })]);
    expect(ledger(h)).toEqual([{ kind: 'reserve', amountCents: 300_000 }]);
  });

  it('rejecting or withdrawing releases the reservation, in the transition that ends the run', async () => {
    const h = setup(500_000);
    const rejected = await submitted(h);
    await h.answer(P, rejected, 'fiona', 'reject', 'Not needed.');
    const withdrawn = await submitted(h);
    await h.fire(P, withdrawn, 'withdraw', {}, 'alice');
    expect(record(h, rejected).reservationStatus).toBe('released');
    expect(record(h, withdrawn).reservationStatus).toBe('released');
    expect(ledger(h).map((row) => row.kind)).toEqual([
      'reserve',
      'release',
      'reserve',
      'release',
    ]);
    expect(await h.open(P, withdrawn)).toEqual([]);
    await submitted(h, { amountCents: 500_000 });
  });

  it('a reservation that cannot be written rolls the submission back, and opens no task', async () => {
    const h = setup();
    const id = await drafted(h, { applicantId: 'bob' });
    const insert = h.store.insertRecord.bind(h.store);
    h.store.insertRecord = (collection, values) => {
      if (collection === PAYMENT_RESERVATIONS) throw new Error('Disk full.');
      return insert(collection, values);
    };
    await expect(h.fire(P, id, 'submit', {}, 'bob')).rejects.toThrow(
      'Disk full.',
    );
    expect(record(h, id).status).toBe('draft');
    expect(await h.tasks(P, id)).toEqual([]);
  });
});

describe('scenario 27 · the request changed', () => {
  it('a change while pending cannot be approved as it is', async () => {
    const h = setup();
    const id = await submitted(h);
    h.store.patchRecord(P, id, { amountCents: 450_000 });
    expect((await refusal(h.answer(P, id, 'fiona'))).code).toBe(
      'CONTENT_CHANGED',
    );
  });

  it('a change after approval: execution is refused before the money moves, and a new approval is a new run', async () => {
    const h = setup();
    const id = await approved(h, { executionMode: 'scheduled' });
    h.store.patchRecord(P, id, { amountCents: 450_000 });
    await expect(h.fire(P, id, 'execute', {}, 'tom')).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'changedSinceApproval' })],
    });
    await h.fire(
      P,
      id,
      'requestReapproval',
      { reason: 'Price went up.' },
      'alice',
    );
    expect(await h.stage(P, id)).toBe('financeApproval');
    expect(record(h, id)).toMatchObject({
      status: 'approving',
      approvedAt: null,
      approvalRound: 2,
      reservedCents: 450_000,
    });
    await h.answer(P, id, 'fiona');
    await h.fire(P, id, 'execute', {}, 'tom');
    expect(record(h, id)).toMatchObject({
      status: 'executed',
      paidCents: 450_000,
      approvedSnapshot: { amountCents: 450_000 },
    });
    expect((await h.runs(P, id)).map((run) => run.status)).toEqual([
      'approved',
      'approved',
    ]);
  });

  it('only finance terminates after approval; the applicant withdraws before it', async () => {
    const h = setup();
    const id = await approved(h, { executionMode: 'scheduled' });
    await expect(h.fire(P, id, 'withdraw', {}, 'alice')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await h.fire(P, id, 'terminate', { reason: 'Project cancelled.' }, 'fiona');
    expect(record(h, id)).toMatchObject({
      status: 'terminated',
      reservationStatus: 'released',
      approvedBy: 'fiona',
    });
  });

  it('limitation: an operator retryRun on a failed run still pays without moving the record; the business key saves the retry after it', async () => {
    const h = setup();
    h.external.balanceCents = 0;
    const id = await approved(h);
    const [run] = (await h.runtime.history(P, id)).effectRuns.filter(
      (item) => item.effect === 'scenarioPayments.executePayment',
    );
    h.external.balanceCents = 1_000_000;
    await h.runtime.retryRun(run.id);
    expect(record(h, id)).toMatchObject({
      status: 'executionFailed',
      paidCents: 0,
    });
    await h.fire(P, id, 'retryExecution', {}, 'tom');
    expect(record(h, id)).toMatchObject({
      status: 'executed',
      paidCents: 300_000,
    });
    expect(h.external.payments.size).toBe(1);
  });
});
