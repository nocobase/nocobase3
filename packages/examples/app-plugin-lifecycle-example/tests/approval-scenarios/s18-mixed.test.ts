// Scenario 18: human review + system task + external event — supplier onboarding.
import { LifecycleError, SYSTEM_ACTOR } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  LOW_RISK_EXEMPTION,
  supplierOnboardingLifecycle,
} from '../../server/approval-scenarios/supplier.js';
import { createHarness, type Harness } from './harness.js';

const S = 'supplierOnboardings';

function setup(parameters: Record<string, unknown> = {}): Harness {
  return createHarness({
    org: {
      people: ['sam', 'lena', 'rita', 'hank', 'oscar'],
      roles: {
        legal: ['lena'],
        riskOfficer: ['rita'],
        riskHead: ['hank'],
        supplierOps: ['oscar'],
      },
    },
    lifecycles: [supplierOnboardingLifecycle],
    parameters: { [S]: parameters },
  });
}

async function submit(
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
      // A database row starts with these empty.
      approvedAt: null,
      approvalBasis: null,
    },
    'sam',
  );
  return String(record.id);
}

/** Submits and gets legal approval; the registry check runs in the same call. */
async function pastLegal(
  h: Harness,
  registrationNo = 'REG-1',
  risk: 'low' | 'high' = 'low',
): Promise<string> {
  const id = await submit(h, registrationNo, risk);
  await h.fire(S, id, 'legalApprove', {}, 'lena');
  return id;
}

function deposit(
  h: Harness,
  id: string,
  eventId: string,
  amountCents = 1_000_000,
): Promise<unknown> {
  return h.runtime.fire(S, id, 'depositReceived', {
    actor: SYSTEM_ACTOR,
    requestId: `deposit:${eventId}`,
    input: { depositRef: `DEP-${eventId}`, amountCents },
  });
}

async function effectRuns(h: Harness, id: string, effect: string) {
  return (await h.runtime.history(S, id)).effectRuns.filter(
    (run) => run.effect === effect,
  );
}

describe('scenario 18 · main path: legal → registry → (exemption | risk review) → deposit → account', () => {
  it('low risk is approved by exemption with its rule and evidence recorded, then the account is created', async () => {
    const h = setup();
    const id = await pastLegal(h);
    const record = h.get(S, id);
    expect(record).toMatchObject({
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
    expect(record.approvedAt).toBe(h.now().toISOString());
    expect(await h.history(S, id)).toEqual([
      '$create',
      'legalApprove',
      'registryChecked',
      'accountCreated',
    ]);
    expect(h.messagesTo('rita')).toEqual([]);
  });

  it('low risk with a deposit required (parameter) waits for the deposit after the exemption', async () => {
    const h = setup({ lowRiskNeedsDeposit: true });
    const id = await pastLegal(h);
    expect(h.get(S, id).status).toBe('awaitingDeposit');
    expect(h.get(S, id).approvalBasis).toMatchObject({ kind: 'exemption' });
    await deposit(h, id, 'e1');
    expect(h.get(S, id).status).toBe('active');
  });

  it('high risk: the risk reviewer approves, the deposit event arrives twice and counts once, the account is created', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    expect(h.get(S, id)).toMatchObject({
      status: 'riskReview',
      riskReviewerId: 'rita',
      approvedAt: null,
    });
    expect(h.messagesTo('rita')).toEqual(['Risk review: Acme']);
    expect(await h.allowed(S, id, 'rita')).toEqual(
      expect.arrayContaining(['riskApprove', 'riskReject']),
    );

    await h.fire(S, id, 'riskApprove', {}, 'rita');
    expect(h.get(S, id)).toMatchObject({
      status: 'awaitingDeposit',
      approvalBasis: { kind: 'decision', decidedBy: 'rita', risk: 'high' },
    });

    await deposit(h, id, 'e7');
    const replay = await deposit(h, id, 'e7');
    expect(replay).toMatchObject({ replayed: true });
    expect(h.get(S, id)).toMatchObject({
      status: 'active',
      depositRef: 'DEP-e7',
    });
    const history = await h.history(S, id);
    expect(history.filter((name) => name === 'depositReceived')).toHaveLength(
      1,
    );
  });

  it('an external event without the system identity, or below the required deposit, is refused', async () => {
    const h = setup({ lowRiskNeedsDeposit: true });
    const id = await pastLegal(h);
    await expect(
      h.fire(
        S,
        id,
        'depositReceived',
        { depositRef: 'X', amountCents: 1_000_000 },
        'sam',
      ),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    await expect(deposit(h, id, 'small', 10)).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
      blockers: [expect.objectContaining({ code: 'depositTooSmall' })],
    });
    expect(h.get(S, id).status).toBe('awaitingDeposit');
  });

  it('legal and risk reviewers cannot review their own onboarding, and only the supplier withdraws', async () => {
    const h = setup();
    h.org.grantRole('sam', 'legal');
    const id = await submit(h);
    await expect(
      h.fire(S, id, 'legalApprove', {}, 'sam'),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'selfReview' })],
    });
    await expect(h.fire(S, id, 'withdraw', {}, 'lena')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    expect((await h.fire(S, id, 'withdraw', {}, 'sam')).status).toBe(
      'withdrawn',
    );
  });
});

describe('scenario 18 · variant: verification fails', () => {
  it('a transient registry outage is retried by the effect and the check succeeds', async () => {
    const h = setup();
    h.external.outages.set('checkCompany', 2);
    const id = await pastLegal(h);
    expect(h.get(S, id).status).toBe('active');
    const [run] = await effectRuns(h, id, 'supplierOnboardings.checkRegistry');
    expect(run).toMatchObject({ status: 'succeeded', attempts: 3 });
  });

  it('strategy: a check that fails after its retries goes to manual verification, not to a rejection or an approval', async () => {
    const h = setup();
    h.external.outages.set('checkCompany', 3);
    const id = await pastLegal(h);
    expect(h.get(S, id)).toMatchObject({
      status: 'manualVerification',
      approvedAt: null,
    });
    expect(
      h.external.calls.filter((call) => call.startsWith('checkCompany')),
    ).toHaveLength(3);
    const [run] = await effectRuns(h, id, 'supplierOnboardings.checkRegistry');
    expect(run).toMatchObject({ status: 'failed', attempts: 3 });
  });

  it('a risk officer verifies by hand; a low result is an exemption whose basis names the person and the evidence', async () => {
    const h = setup();
    h.external.outages.set('checkCompany', 3);
    const id = await pastLegal(h);
    await expect(
      h.fire(S, id, 'verifyManually', { risk: 'low' }, 'rita'),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
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

  it('or the risk officer runs the check again once the registry is back', async () => {
    const h = setup();
    h.external.outages.set('checkCompany', 3);
    const id = await pastLegal(h, 'REG-H', 'high');
    await h.fire(S, id, 'recheck', { reason: 'Registry is back.' }, 'rita');
    expect(h.get(S, id)).toMatchObject({
      status: 'riskReview',
      verificationRound: 2,
      verificationError: null,
    });
  });
});

describe('scenario 18 · variant: risk information changes', () => {
  it('a change during risk review re-checks; the new result decides under a new round', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    h.external.companyRisk['REG-L'] = 'low';
    await h.fire(
      S,
      id,
      'recheck',
      { reason: 'Registration changed.', registrationNo: 'REG-L' },
      SYSTEM_ACTOR,
    );
    expect(h.get(S, id)).toMatchObject({
      status: 'active',
      registrationNo: 'REG-L',
      verificationRound: 2,
      approvalBasis: { kind: 'exemption', round: 2 },
    });
  });

  it('a change after approval withdraws the approval on the record; the log keeps the decision that granted it', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    await h.fire(S, id, 'riskApprove', {}, 'rita');
    expect(h.get(S, id).approvedAt).not.toBeNull();

    await h.fire(S, id, 'recheck', { reason: 'New court case.' }, 'rita');
    expect(h.get(S, id)).toMatchObject({
      status: 'riskReview',
      approvedAt: null,
      approvalBasis: null,
      verificationRound: 2,
    });
    expect(await h.history(S, id)).toContain('riskApprove');
    // The reviewer is told again for the new round.
    expect(h.messagesTo('rita')).toHaveLength(2);
  });

  it('a late result of an earlier round is refused rather than deciding the current round', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    await h.fire(S, id, 'recheck', { reason: 'Changed.' }, 'rita');
    expect(h.get(S, id).verificationRound).toBe(2);
    // The in-process dispatcher finishes every check inside fire(), so put
    // the record back in verifying to stand for round 2 still running when
    // an answer to round 1 arrives late.
    h.store.patchRecord(supplierOnboardingLifecycle.collection, id, {
      status: 'verifying',
    });
    await expect(
      h.runtime.fire(S, id, 'registryChecked', {
        actor: SYSTEM_ACTOR,
        input: { risk: 'low', round: 1, registrationNo: 'REG-H' },
      }),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'staleResult' })],
    });
  });

  it('cannot re-check while the account is being created', async () => {
    const h = setup();
    const id = await pastLegal(h);
    h.store.patchRecord(supplierOnboardingLifecycle.collection, id, {
      status: 'creatingAccount',
    });
    await expect(
      h.fire(S, id, 'recheck', { reason: 'x' }, 'rita'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('scenario 18 · variant: the risk reviewer waits for days', () => {
  it('is reminded, then passed to the head of risk; nothing is approved by waiting', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');

    h.advance({ days: 1 });
    expect(await h.runtime.runTriggers()).toBe(0);
    h.advance({ days: 1, minutes: 1 });
    expect(await h.runtime.runTriggers()).toBe(1);
    expect(h.get(S, id).status).toBe('riskReviewOverdue');
    expect(h.messagesTo('rita')).toContain('Overdue risk review: Acme');

    h.advance({ days: 3, minutes: 1 });
    await h.runtime.runTriggers();
    expect(h.get(S, id)).toMatchObject({
      status: 'riskReviewOverdue',
      riskReviewerId: 'hank',
    });
    expect(h.messagesTo('hank')).toEqual(['Overdue risk review: Acme']);
    expect(await h.allowed(S, id, 'rita')).not.toContain('riskApprove');

    h.advance({ days: 30 });
    await h.runtime.runTriggers();
    expect(h.get(S, id)).toMatchObject({
      status: 'riskReviewOverdue',
      riskReviewerId: 'hank',
      approvedAt: null,
    });
    expect(h.messagesTo('hank')).toHaveLength(1);

    await h.fire(S, id, 'riskApprove', {}, 'hank');
    expect(h.get(S, id).approvalBasis).toMatchObject({ decidedBy: 'hank' });
  });

  it('an approved supplier that never pays the deposit is cancelled; the approval fact stays', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    await h.fire(S, id, 'riskApprove', {}, 'rita');
    h.advance({ days: 14, minutes: 1 });
    await h.runtime.runTriggers();
    expect(h.get(S, id)).toMatchObject({
      status: 'cancelled',
      approvalBasis: { kind: 'decision' },
    });
  });
});

describe('scenario 18 · variant: approved, but the account cannot be created', () => {
  it('goes to accountFailed — not rejected — keeps the approval, tells operations, and a retry opens one account', async () => {
    const h = setup();
    h.external.outages.set('createSupplierAccount', 3);
    const id = await pastLegal(h);
    const failed = h.get(S, id);
    expect(failed).toMatchObject({
      status: 'accountFailed',
      approvalBasis: { kind: 'exemption' },
      accountError: 'createSupplierAccount is unavailable.',
    });
    expect(failed.approvedAt).not.toBeNull();
    expect(h.messagesTo('oscar')).toEqual([
      'Supplier account creation failed: Acme',
    ]);

    await expect(
      h.fire(S, id, 'retryAccount', {}, 'sam'),
    ).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    await h.fire(S, id, 'retryAccount', {}, 'oscar');
    expect(h.get(S, id)).toMatchObject({
      status: 'active',
      account: 'ACC-1-Acme',
      accountError: null,
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
});

describe('scenario 18 · limitations', () => {
  it('limitation: an early deposit kept by a self-transition restarts the risk reviewer’s idle clock', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    h.advance({ days: 1, hours: 12 });
    await deposit(h, id, 'early');
    expect(h.get(S, id)).toMatchObject({
      status: 'riskReview',
      depositRef: 'DEP-early',
    });
    // Two days after the review started, no reminder: the self-transition
    // stamped statusChangedAt, and a trigger measures from it.
    h.advance({ hours: 12, minutes: 1 });
    expect(await h.runtime.runTriggers()).toBe(0);
    expect(h.get(S, id).status).toBe('riskReview');
    // Approval then skips awaitingDeposit, because the deposit is already in.
    await h.fire(S, id, 'riskApprove', {}, 'rita');
    expect(h.get(S, id).status).toBe('active');
  });

  it('limitation: the failure continuation receives only the error message, so the round travels inside it', async () => {
    const h = setup();
    h.external.outages.set('checkCompany', 3);
    const id = await pastLegal(h);
    expect(h.get(S, id).verificationError).toBe(
      'round=1: checkCompany is unavailable.',
    );
  });

  it('limitation: with the in-process dispatcher every retry runs at once; the backoff is only recorded as runAfter', async () => {
    const h = setup();
    h.external.outages.set('checkCompany', 3);
    const before = h.now().toISOString();
    const id = await pastLegal(h);
    const [run] = await effectRuns(h, id, 'supplierOnboardings.checkRegistry');
    expect(h.now().toISOString()).toBe(before);
    expect(run.attempts).toBe(3);
    expect(run.runAfter && run.runAfter > before).toBe(true);
  });

  it('limitation: editing the registration number does not re-check; someone must fire recheck', async () => {
    const h = setup();
    const id = await pastLegal(h, 'REG-H', 'high');
    await h.fire(S, id, 'riskApprove', {}, 'rita');
    h.store.patchRecord(supplierOnboardingLifecycle.collection, id, {
      registrationNo: 'REG-OTHER',
    });
    const record = h.get(S, id);
    expect(record).toMatchObject({
      status: 'awaitingDeposit',
      registrationNo: 'REG-OTHER',
      approvalBasis: { kind: 'decision' },
    });
  });

  it('limitation: retrying the account creation starts a new effect run with a new run key; only the business key prevents a second account', async () => {
    const h = setup();
    h.external.outages.set('createSupplierAccount', 3);
    const id = await pastLegal(h);
    await h.fire(S, id, 'retryAccount', {}, 'oscar');
    const runs = await effectRuns(h, id, 'supplierOnboardings.createAccount');
    expect(runs.map((run) => run.status)).toEqual(['failed', 'succeeded']);
    expect(new Set(runs.map((run) => run.id)).size).toBe(2);
    expect(
      new Set(
        h.external.calls
          .filter((call) => call.startsWith('createSupplierAccount'))
          .map((call) => call.split(':').slice(1).join(':')),
      ),
    ).toEqual(new Set([`supplier-account:${id}`]));
  });

  it('limitation: a deposit event arriving before onboarding can wait for it is refused, and the sender must redeliver', async () => {
    const h = setup();
    const id = await submit(h);
    await expect(deposit(h, id, 'too-early')).rejects.toBeInstanceOf(
      LifecycleError,
    );
    await expect(deposit(h, id, 'too-early')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });
});
