// Scenario 27: effect after approval, and execution failure — a payment request.
import { SYSTEM_ACTOR } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  executeDuePayments,
  PAYMENT_RESERVATIONS,
  paymentKey,
  paymentRequestLifecycle,
  type PaymentRequest,
} from '../../server/approval-scenarios/payment.js';
import { PaymentDeclined } from '../../server/approval-scenarios/services.js';
import { createHarness, type Harness } from './harness.js';

const P = 'paymentRequests';
const COLLECTION = paymentRequestLifecycle.collection;

function setup(budgetCents = 10_000_000): Harness {
  return createHarness({
    org: {
      people: ['alice', 'fiona', 'tom', 'bob'],
      roles: { financeApprover: ['fiona'], treasurer: ['tom'] },
    },
    lifecycles: [paymentRequestLifecycle],
    parameters: { [P]: { budgetCents } },
  });
}

interface Draft {
  readonly amountCents?: number;
  readonly executionMode?: 'immediate' | 'scheduled';
  readonly installments?: number;
  readonly applicantId?: string;
}

async function submitted(h: Harness, draft: Draft = {}): Promise<string> {
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
      paidCents: 0,
      installmentsPaid: 0,
    },
    applicant,
  );
  const id = String(record.id);
  await h.fire(P, id, 'submit', {}, applicant);
  return id;
}

async function approved(h: Harness, draft: Draft = {}): Promise<string> {
  const id = await submitted(h, draft);
  await h.fire(P, id, 'approve', {}, 'fiona');
  return id;
}

function record(h: Harness, id: string): PaymentRequest {
  return h.get(P, id) as PaymentRequest;
}

function ledger(h: Harness): { kind: unknown; amountCents: unknown }[] {
  return h.store
    .all(PAYMENT_RESERVATIONS)
    .map((row) => ({ kind: row.kind, amountCents: row.amountCents }));
}

function payCalls(h: Harness): string[] {
  return h.external.calls.filter((call) => call.startsWith('pay:'));
}

describe('scenario 27 · variant: execute immediately', () => {
  it('approval and execution are recorded separately; the reservation is consumed', async () => {
    const h = setup();
    const id = await approved(h);
    const paid = record(h, id);
    expect(paid).toMatchObject({
      status: 'executed',
      approvedBy: 'fiona',
      approvedSnapshot: { payeeId: 'vendor-1', amountCents: 300_000 },
      paidCents: 300_000,
      paymentRefs: ['PAY-1'],
      reservationStatus: 'consumed',
    });
    expect(paid.approvedAt).toBe(h.now().toISOString());
    expect(await h.history(P, id)).toEqual([
      '$create',
      'submit',
      'approve',
      'paid',
    ]);
    expect(h.messagesTo('alice')).toEqual(['Payment executed: Laptop']);
  });

  it('the applicant cannot approve their own request, and only the assigned approver can', async () => {
    const h = setup();
    h.org.grantRole('alice', 'financeApprover');
    const id = await submitted(h);
    await expect(h.fire(P, id, 'approve', {}, 'alice')).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'selfApproval' })],
    });
    await expect(h.fire(P, id, 'approve', {}, 'tom')).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'approverOnly' })],
    });
  });
});

describe('scenario 27 · variant: a person chooses when to execute', () => {
  it('approved waits; a treasurer schedules it; the sweep executes it once it is due', async () => {
    const h = setup();
    const id = await approved(h, { executionMode: 'scheduled' });
    expect(record(h, id).status).toBe('approved');
    const at = new Date(h.now().getTime() + 2 * 86_400_000).toISOString();
    await expect(
      h.fire(P, id, 'schedule', { executeAt: at }, 'alice'),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    await h.fire(P, id, 'schedule', { executeAt: at }, 'tom');

    expect(await executeDuePayments(h.runtime, h.services, h.now())).toEqual({
      executed: [],
      refused: [],
    });
    // The system cannot execute before the date either.
    await expect(
      h.fire(P, id, 'execute', {}, SYSTEM_ACTOR),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });

    h.advance({ days: 2 });
    const result = await executeDuePayments(h.runtime, h.services, h.now());
    expect(result.executed).toEqual([record(h, id).id]);
    expect(record(h, id)).toMatchObject({ status: 'executed', executeAt: at });
  });

  it('two sweeps at once execute it once: the second is a replay', async () => {
    const h = setup();
    const id = await approved(h, { executionMode: 'scheduled' });
    await h.fire(
      P,
      id,
      'schedule',
      { executeAt: h.now().toISOString() },
      'tom',
    );
    const [first, second] = await Promise.all([
      executeDuePayments(h.runtime, h.services, h.now()),
      executeDuePayments(h.runtime, h.services, h.now()),
    ]);
    expect([...first.executed, ...second.executed]).toHaveLength(1);
    expect(payCalls(h)).toHaveLength(1);
  });

  it('a treasurer may execute it by hand before its date; an approver cannot', async () => {
    const h = setup();
    const id = await approved(h, { executionMode: 'scheduled' });
    await expect(h.fire(P, id, 'execute', {}, 'fiona')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    await h.fire(P, id, 'execute', {}, 'tom');
    expect(record(h, id).status).toBe('executed');
  });
});

describe('scenario 27 · variant: insufficient balance', () => {
  it('a decline is not retried; executionFailed keeps the approval and the reservation', async () => {
    const h = setup();
    h.external.balanceCents = 100;
    const id = await approved(h);
    expect(record(h, id)).toMatchObject({
      status: 'executionFailed',
      failureKind: 'declined',
      approvedBy: 'fiona',
      reservationStatus: 'held',
      paidCents: 0,
    });
    expect(record(h, id).approvedAt).not.toBeNull();
    expect(payCalls(h)).toHaveLength(1);
    expect(h.messagesTo('alice')).toEqual(['Payment executionFailed: Laptop']);
  });

  it('strategy: once funded, a treasurer retries without a new approval; the applicant cannot', async () => {
    const h = setup();
    h.external.balanceCents = 100;
    const id = await approved(h);
    h.external.balanceCents = 1_000_000;
    await expect(
      h.fire(P, id, 'retryExecution', {}, 'alice'),
    ).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    await h.fire(P, id, 'retryExecution', {}, 'tom');
    expect(record(h, id)).toMatchObject({
      status: 'executed',
      failureKind: null,
      approvedBy: 'fiona',
    });
    expect(h.external.payments.size).toBe(1);
  });
});

describe('scenario 27 · variant: the provider succeeded but its response was lost', () => {
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
    expect(h.external.payments.size).toBe(1);
  });

  it('when the retries run out the outcome is unknown: reconciling looks the key up and finds the payment', async () => {
    const h = setup();
    const real = h.external.pay.bind(h.external);
    let calls = 0;
    // The first call pays and loses its answer; the provider is then down.
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
      failureKind: null,
    });
    expect(calls).toBe(3);
    expect(h.external.payments.size).toBe(1);
    expect(await h.history(P, id)).toEqual([
      '$create',
      'submit',
      'approve',
      'payFailed',
      'reconciled',
    ]);
  });

  it('when reconciliation finds nothing, the failure is known and a retry is safe', async () => {
    const h = setup();
    const real = h.external.pay.bind(h.external);
    h.external.pay = () => {
      throw new Error('Provider unavailable.');
    };
    const id = await approved(h);
    expect(record(h, id)).toMatchObject({
      status: 'executionFailed',
      failureKind: 'notExecuted',
    });
    h.external.pay = real;
    await h.fire(P, id, 'retryExecution', {}, 'tom');
    expect(record(h, id).status).toBe('executed');
    expect(h.external.payments.size).toBe(1);
  });

  it('while the outcome is unknown, nobody can terminate or retry it; a treasurer can only reconcile again', async () => {
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
    await expect(
      h.fire(P, id, 'terminate', { reason: 'x' }, 'tom'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });

    h.external.findPayment = realFind;
    await h.fire(P, id, 'reconcileAgain', {}, 'tom');
    expect(record(h, id)).toMatchObject({
      status: 'executionFailed',
      failureKind: 'notExecuted',
    });
  });
});

describe('scenario 27 · variant: partial execution (installments)', () => {
  it('a decline on the second installment leaves it partly paid; a retry resumes at that installment', async () => {
    const h = setup();
    h.external.balanceCents = 100_000;
    const id = await approved(h, { installments: 3 });
    expect(record(h, id)).toMatchObject({
      status: 'executionFailed',
      failureKind: 'declined',
      installmentsPaid: 1,
      paidCents: 100_000,
    });
    h.external.balanceCents = 1_000_000;
    await h.fire(P, id, 'retryExecution', {}, 'tom');
    expect(record(h, id)).toMatchObject({
      status: 'executed',
      installmentsPaid: 3,
      paidCents: 300_000,
      paymentRefs: ['PAY-1', 'PAY-2', 'PAY-3'],
    });
  });

  it('strategy: a partly paid request is terminated, not re-approved; only the unpaid part is released', async () => {
    const h = setup(1_000_000);
    h.external.balanceCents = 100_000;
    const id = await approved(h, { installments: 3 });
    await expect(
      h.fire(P, id, 'requestReapproval', { reason: 'x' }, 'alice'),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'partlyPaid' })],
    });
    await expect(
      h.fire(P, id, 'terminate', { reason: 'Stop.' }, 'alice'),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    await h.fire(P, id, 'terminate', { reason: 'Vendor dispute.' }, 'tom');
    expect(record(h, id)).toMatchObject({
      status: 'terminated',
      paidCents: 100_000,
      reservationStatus: 'partiallyConsumed',
    });
    expect(ledger(h)).toEqual([
      { kind: 'reserve', amountCents: 300_000 },
      { kind: 'release', amountCents: 200_000 },
    ]);
  });
});

describe('scenario 27 · variant: reserve resources before approval', () => {
  it('submitting reserves the amount; a request beyond the budget is refused with a reason', async () => {
    const h = setup(500_000);
    await submitted(h);
    const second = await h.create(
      P,
      {
        title: 'Desk',
        applicantId: 'bob',
        payeeId: 'vendor-2',
        amountCents: 300_000,
        budgetCode: 'IT',
      },
      'bob',
    );
    const check = await h.runtime.can(P, second.id, 'submit', { id: 'bob' });
    expect(check.blockers).toEqual([
      expect.objectContaining({ code: 'budgetExhausted' }),
    ]);
    await expect(
      h.fire(P, second.id, 'submit', {}, 'bob'),
    ).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    expect(ledger(h)).toEqual([{ kind: 'reserve', amountCents: 300_000 }]);
  });

  it('rejecting or withdrawing releases the reservation', async () => {
    const h = setup(500_000);
    const rejected = await submitted(h);
    await h.fire(P, rejected, 'reject', { reason: 'Not needed.' }, 'fiona');
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
    // The whole budget is free again.
    await submitted(h, { amountCents: 500_000 });
  });

  it('a reservation the transition cannot write rolls the submission back', async () => {
    const h = setup();
    const draft = await h.create(
      P,
      {
        title: 'Desk',
        applicantId: 'bob',
        payeeId: 'vendor-2',
        amountCents: 1000,
        budgetCode: 'IT',
      },
      'bob',
    );
    h.services.records.insert = () => Promise.reject(new Error('Disk full.'));
    await expect(h.fire(P, draft.id, 'submit', {}, 'bob')).rejects.toThrow(
      'Disk full.',
    );
    expect(record(h, String(draft.id)).status).toBe('draft');
  });
});

describe('scenario 27 · strategy: the business record changed after approval', () => {
  it('execution is refused before the money moves, the sweep reports it, and a new approval is required', async () => {
    const h = setup();
    const id = await approved(h, { executionMode: 'scheduled' });
    await h.fire(
      P,
      id,
      'schedule',
      { executeAt: h.now().toISOString() },
      'tom',
    );
    h.store.patchRecord(COLLECTION, id, { amountCents: 450_000 });

    await expect(h.fire(P, id, 'execute', {}, 'tom')).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'changedSinceApproval' })],
    });
    const sweep = await executeDuePayments(h.runtime, h.services, h.now());
    expect(sweep.executed).toEqual([]);
    expect(sweep.refused).toHaveLength(1);
    expect(payCalls(h)).toEqual([]);

    await h.fire(
      P,
      id,
      'requestReapproval',
      { reason: 'Price went up.' },
      'alice',
    );
    expect(record(h, id)).toMatchObject({
      status: 'pendingApproval',
      approvedAt: null,
      approvalRound: 2,
      reservedCents: 450_000,
    });
    await h.fire(P, id, 'approve', {}, 'fiona');
    await h.fire(P, id, 'execute', {}, 'tom');
    expect(record(h, id)).toMatchObject({
      status: 'executed',
      paidCents: 450_000,
      approvedSnapshot: { amountCents: 450_000 },
    });
    expect(
      (await h.history(P, id)).filter((name) => name === 'approve'),
    ).toHaveLength(2);
    expect(ledger(h)).toEqual([
      { kind: 'reserve', amountCents: 300_000 },
      { kind: 'release', amountCents: 300_000 },
      { kind: 'reserve', amountCents: 450_000 },
    ]);
  });

  it('a change between commit and payment is caught by the effect: contentChanged, not retried, and retry is refused', async () => {
    const h = setup();
    // An edit lands after approve commits and before its effect runs.
    h.runtime.on('entered', { lifecycle: P, state: 'executing' }, (event) => {
      h.store.patchRecord(COLLECTION, event.record.id, { payeeId: 'vendor-9' });
    });
    const id = await approved(h);
    expect(record(h, id)).toMatchObject({
      status: 'executionFailed',
      failureKind: 'contentChanged',
    });
    expect(payCalls(h)).toEqual([]);
    expect(await h.allowed(P, id, 'tom')).not.toContain('retryExecution');
    expect(await h.allowed(P, id, 'tom')).toEqual(
      expect.arrayContaining(['requestReapproval', 'terminate']),
    );
  });
});

describe('scenario 27 · strategy: who may terminate', () => {
  it('the applicant withdraws before approval; after it only finance (treasurer or the approver) terminates', async () => {
    const h = setup();
    const id = await approved(h, { executionMode: 'scheduled' });
    await expect(h.fire(P, id, 'withdraw', {}, 'alice')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(
      h.fire(P, id, 'terminate', { reason: 'No.' }, 'alice'),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    await h.fire(P, id, 'terminate', { reason: 'Project cancelled.' }, 'fiona');
    expect(record(h, id)).toMatchObject({
      status: 'terminated',
      reservationStatus: 'released',
      approvedBy: 'fiona',
    });
  });
});

describe('scenario 27 · limitations', () => {
  it('limitation: a chosen execution date is not a trigger; without the sweep nothing executes', async () => {
    const h = setup();
    const id = await approved(h, { executionMode: 'scheduled' });
    await h.fire(
      P,
      id,
      'schedule',
      { executeAt: h.now().toISOString() },
      'tom',
    );
    h.advance({ days: 10 });
    expect(await h.runtime.runTriggers()).toBe(0);
    expect(record(h, id).status).toBe('approved');
  });

  it('limitation: a refusal in the sweep only reaches its caller; nobody is notified and the record stays approved', async () => {
    const h = setup();
    const id = await approved(h, { executionMode: 'scheduled' });
    await h.fire(
      P,
      id,
      'schedule',
      { executeAt: h.now().toISOString() },
      'tom',
    );
    h.store.patchRecord(COLLECTION, id, { amountCents: 1 });
    const sent = h.sent.length;
    await executeDuePayments(h.runtime, h.services, h.now());
    await executeDuePayments(h.runtime, h.services, h.now());
    expect(record(h, id).status).toBe('approved');
    expect(h.sent.length).toBe(sent);
  });

  it('limitation: the failure continuation only receives the message, so the kind is a message prefix', async () => {
    const h = setup();
    h.external.balanceCents = 0;
    const id = await approved(h);
    expect(record(h, id).failureError).toBe('declined: Insufficient balance.');
    expect(new PaymentDeclined('x')).toBeInstanceOf(Error);
  });

  it('limitation: an operator retryRun on the failed run pays but cannot move the record; the business key saves the retry after it', async () => {
    const h = setup();
    h.external.balanceCents = 0;
    const id = await approved(h);
    const [run] = (await h.runtime.history(P, id)).effectRuns.filter(
      (item) => item.effect === 'paymentRequests.executePayment',
    );
    h.external.balanceCents = 1_000_000;
    const retried = await h.runtime.retryRun(run.id);
    expect(retried?.status).toBe('succeeded');
    // The money moved, but `paid` cannot start from executionFailed.
    expect(h.external.payments.size).toBe(1);
    expect(record(h, id)).toMatchObject({
      status: 'executionFailed',
      paidCents: 0,
    });
    // The record's own retry pays under the same key and finds that payment.
    await h.fire(P, id, 'retryExecution', {}, 'tom');
    expect(record(h, id)).toMatchObject({
      status: 'executed',
      paidCents: 300_000,
    });
    expect(h.external.payments.size).toBe(1);
  });
});
