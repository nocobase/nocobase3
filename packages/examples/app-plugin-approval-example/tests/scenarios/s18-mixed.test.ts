// Scenario 18: human review, a system check, an external event
// and an execution step in one supplier onboarding.
import { SYSTEM_ACTOR } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  handleDeposit,
  LOW_RISK_EXEMPTION,
  supplierLegalApproval,
  supplierLifecycle,
  supplierRiskApproval,
  SUPPLIERS,
} from '../../server/scenarios/supplier.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const S = SUPPLIERS;

function setup(parameters: Record<string, unknown> = {}): Harness {
  return createHarness({
    org: {
      people: ['sam', 'lena', 'rita', 'hank', 'oscar'],
      managers: { rita: 'hank' },
      roles: {
        legal: ['lena'],
        riskOfficer: ['rita'],
        riskHead: ['hank'],
        supplierOps: ['oscar'],
      },
    },
    lifecycles: [supplierLifecycle as never],
    approvals: [supplierLegalApproval as never, supplierRiskApproval as never],
    parameters: { [S]: parameters },
  });
}

async function submitted(
  h: Harness,
  registrationNo = 'REG-1',
  risk: 'low' | 'high' = 'low',
): Promise<string> {
  h.external.companyRisk[registrationNo] = risk;
  const record = await h.create(
    S,
    {
      name: 'Acme',
      registrationNo,
      applicantId: 'sam',
      verificationRound: 0,
      riskLevel: null,
      verificationError: null,
      legalApprovedBy: null,
      approvedAt: null,
      approvalBasis: null,
      depositRef: null,
      account: null,
      accountError: null,
    },
    'sam',
  );
  await h.fire(S, record.id, 'submit', {}, 'sam');
  return String(record.id);
}

async function pastLegal(
  h: Harness,
  registrationNo = 'REG-1',
  risk: 'low' | 'high' = 'low',
): Promise<string> {
  const id = await submitted(h, registrationNo, risk);
  await h.answer(S, id, 'lena');
  return id;
}

const deposit = (
  h: Harness,
  id: string,
  eventId: string,
  amountCents = 1_000_000,
) =>
  handleDeposit(h.runtime, {
    id: eventId,
    supplierId: id,
    depositRef: `DEP-${eventId}`,
    amountCents,
  });

describe('scenario 18 · legal → registry → (exemption | risk review) → deposit → account', () => {
  it('low risk is approved by exemption with its rule and evidence recorded, then the account is created', async () => {
    const h = setup();
    const id = await pastLegal(h);
    expect(h.get(S, id)).toMatchObject({
      status: 'active',
      riskLevel: 'low',
      legalApprovedBy: 'lena',
      account: 'ACC-1-Acme',
      approvalBasis: {
        kind: 'exemption',
        rule: LOW_RISK_EXEMPTION,
        legalApprovedBy: 'lena',
        evidence: { source: 'registry', risk: 'low', registrationNo: 'REG-1' },
      },
    });
    expect(await h.history(S, id)).toEqual([
      '$create',
      'submit',
      'legalApproved',
      'registryChecked',
      'depositPaid',
      'accountCreated',
    ]);
  });

  it('high risk: the risk reviewer approves, the deposit arrives twice and counts once, the account is created', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    expect(h.get(S, id)).toMatchObject({
      status: 'riskReview',
      approvedAt: null,
    });
    expect(await h.open(S, id)).toEqual(['rita:pending']);
    await h.answer(S, id, 'rita');
    expect(h.get(S, id)).toMatchObject({
      status: 'awaitingDeposit',
      approvalBasis: { kind: 'decision', decidedBy: 'rita', risk: 'high' },
    });
    expect(await deposit(h, id, 'e7')).toMatchObject({ outcome: 'applied' });
    expect(await deposit(h, id, 'e7')).toMatchObject({ outcome: 'replayed' });
    expect(h.get(S, id)).toMatchObject({
      status: 'active',
      depositRef: 'DEP-e7',
    });
  });

  it('a deposit below the requirement is refused; a deposit event is never a button', async () => {
    const h = setup({ lowRiskNeedsDeposit: true });
    const id = await pastLegal(h);
    expect(h.get(S, id).status).toBe('awaitingDeposit');
    expect(await deposit(h, id, 'small', 10)).toMatchObject({
      outcome: 'refused',
    });
    expect(await h.allowed(S, id, 'sam')).toEqual(['withdraw']);
    expect(h.get(S, id).status).toBe('awaitingDeposit');
  });

  it('the applicant cannot review their own onboarding, and only the supplier withdraws', async () => {
    const h = setup();
    h.org.grantRole('sam', 'legal');
    h.external.companyRisk['REG-1'] = 'low';
    const id = await submitted(h);
    expect(await h.open(S, id)).toEqual(['lena:pending']);
    await expect(h.fire(S, id, 'withdraw', {}, 'lena')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    await h.fire(S, id, 'withdraw', {}, 'sam');
    expect(h.get(S, id).status).toBe('withdrawn');
    expect(await h.open(S, id)).toEqual([]);
  });
});

describe('scenario 18 · verification fails', () => {
  it('a check that fails after its retries goes to manual verification, not to a decision', async () => {
    const h = setup();
    h.external.outages.set('checkCompany', 3);
    const id = await pastLegal(h);
    expect(h.get(S, id)).toMatchObject({
      status: 'manualVerification',
      approvedAt: null,
    });
  });

  it('a risk officer verifies by hand; a low result is an exemption naming the person and the evidence', async () => {
    const h = setup();
    h.external.outages.set('checkCompany', 3);
    const id = await pastLegal(h);
    expect(
      (await refusal(h.fire(S, id, 'verifyManually', { risk: 'low' }, 'rita')))
        .code,
    ).toBe('INVALID_INPUT');
    await h.fire(
      S,
      id,
      'verifyManually',
      { risk: 'low', evidence: 'Checked the paper certificate.' },
      'rita',
    );
    expect(h.get(S, id)).toMatchObject({
      status: 'active',
      approvalBasis: {
        kind: 'exemption',
        evidence: { source: 'manual', verifiedBy: 'rita' },
      },
    });
  });
});

describe('scenario 18 · risk information changes', () => {
  it('a change after approval withdraws the approval; the approval run keeps who granted it', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    await h.answer(S, id, 'rita');
    await h.fire(S, id, 'recheck', { reason: 'New court case.' }, 'rita');
    expect(h.get(S, id)).toMatchObject({
      status: 'riskReview',
      approvedAt: null,
      approvalBasis: null,
      verificationRound: 2,
    });
    const runs = (await h.runs(S, id)).filter(
      (run) => run.source === 'supplierRisk',
    );
    expect(runs.map((run) => [run.status, run.endedBy])).toEqual([
      ['approved', 'rita'],
      ['riskReview', null],
    ]);
  });

  it('a recheck during risk review ends that review: its task is voided, and a new run asks again', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    const old = await h.taskOf(S, id, 'rita');
    await h.fire(S, id, 'recheck', { reason: 'Registration changed.' }, 'rita');
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: old.id,
            actor: { id: 'rita' },
            answer: 'approve',
          }),
        )
      ).code,
    ).toBe('TASK_CLOSED');
    expect(await h.open(S, id)).toEqual(['rita:pending']);
  });

  it('a late result of an earlier round is refused rather than deciding the current one', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    await h.fire(S, id, 'recheck', { reason: 'Changed.' }, 'rita');
    h.store.patchRecord(S, id, { status: 'verifying' });
    await expect(
      h.runtime.fire(S, id, 'registryChecked', {
        actor: SYSTEM_ACTOR,
        input: { risk: 'low', round: 1, registrationNo: 'REG-H' },
      }),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'staleResult' })],
    });
  });
});

describe('scenario 18 · the risk reviewer waits for days', () => {
  it('is reminded, then passed to the head of risk; waiting moves neither the onboarding nor its clock', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    const waiting = h.get(S, id);
    h.advance({ days: 2, minutes: 1 });
    expect(await h.approvals.sweep()).toBe(1);
    expect(h.messagesTo('rita')).toEqual([
      'Review supplier ' + id,
      'Overdue review: supplier ' + id,
    ]);
    h.advance({ days: 3 });
    expect(await h.approvals.sweep()).toBe(1);
    expect(await h.open(S, id)).toEqual(['hank:pending']);
    expect(h.get(S, id)).toBe(waiting);
    await h.answer(S, id, 'hank');
    expect(h.get(S, id).approvalBasis).toMatchObject({ decidedBy: 'hank' });
  });

  it('an early deposit is kept in the ledger without touching the review, and approval goes straight on', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    const waiting = h.get(S, id);
    expect(await deposit(h, id, 'early')).toMatchObject({
      outcome: 'kept',
      state: 'riskReview',
    });
    expect(h.get(S, id)).toBe(waiting);
    await h.answer(S, id, 'rita');
    expect(h.get(S, id)).toMatchObject({
      status: 'active',
      depositRef: 'DEP-early',
    });
  });

  it('a deposit before the onboarding could wait for it is kept, not refused', async () => {
    const h = setup();
    h.external.companyRisk['REG-1'] = 'low';
    const record = await h.create(
      S,
      {
        name: 'Acme',
        registrationNo: 'REG-1',
        applicantId: 'sam',
        verificationRound: 0,
        riskLevel: null,
        verificationError: null,
        legalApprovedBy: null,
        approvedAt: null,
        approvalBasis: null,
        depositRef: null,
        account: null,
        accountError: null,
      },
      'sam',
    );
    expect(await deposit(h, String(record.id), 'too-early')).toMatchObject({
      outcome: 'kept',
      state: 'draft',
    });
  });

  it('an approved supplier that never pays the deposit is cancelled; the approval fact stays', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    await h.answer(S, id, 'rita');
    h.advance({ days: 14, minutes: 1 });
    await h.runtime.runTriggers();
    expect(h.get(S, id)).toMatchObject({
      status: 'cancelled',
      approvalBasis: { kind: 'decision' },
    });
  });
});

describe('scenario 18 · approved, but the account cannot be created', () => {
  it('goes to accountFailed — not rejected — keeps the approval, tells operations, and a retry opens one account', async () => {
    const h = setup();
    h.external.outages.set('createSupplierAccount', 3);
    const id = await pastLegal(h);
    const failed = h.get(S, id);
    expect(failed).toMatchObject({
      status: 'accountFailed',
      approvalBasis: { kind: 'exemption' },
    });
    expect(h.messagesTo('oscar')).toEqual([
      'Supplier account creation failed: Acme',
    ]);
    await expect(
      h.fire(S, id, 'retryAccount', {}, 'sam'),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    await h.fire(S, id, 'retryAccount', {}, 'oscar');
    expect(h.get(S, id)).toMatchObject({
      status: 'active',
      account: 'ACC-1-Acme',
      approvedAt: failed.approvedAt,
    });
    expect(h.external.accounts.size).toBe(1);
  });

  it('operations may give up instead; the approval fact is still there', async () => {
    const h = setup();
    h.external.outages.set('createSupplierAccount', 3);
    const id = await pastLegal(h);
    await h.fire(
      S,
      id,
      'abandon',
      { reason: 'Supplier went bankrupt.' },
      'oscar',
    );
    expect(h.get(S, id)).toMatchObject({
      status: 'cancelled',
      approvalBasis: { kind: 'exemption' },
    });
  });

  it('limitation: the failure continuation still receives only the error message, so the round travels inside it', async () => {
    const h = setup();
    h.external.outages.set('checkCompany', 3);
    const id = await pastLegal(h);
    expect(h.get(S, id).verificationError).toBe(
      'round=1: checkCompany is unavailable.',
    );
  });
});
