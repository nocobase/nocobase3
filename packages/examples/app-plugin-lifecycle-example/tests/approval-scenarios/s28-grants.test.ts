// Scenario 28: several requests on one subject, and approvals used within a scope.
import type {
  FireOptions,
  Lifecycle,
  LifecycleTypes,
  RecordId,
} from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  AUTHORIZATION_REQUESTS,
  authorizationRequestLifecycle,
  budgetGrantLifecycle,
  expireDueGrants,
  type AuthorizationRequest,
  type BudgetGrant,
  type GrantScope,
} from '../../server/approval-scenarios/grant.js';
import { SCENARIO_COLLECTIONS } from '../../server/approval-scenarios/services.js';
import { createHarness, type Harness } from './harness.js';

const ORG = {
  people: ['carl', 'erin', 'dana', 'gary'],
  roles: { contractApprover: ['dana'], grantAuthority: ['gary'] },
};

const OCTOBER: GrantScope = {
  limitCents: 100_000,
  maxUses: null,
  validFrom: '2026-10-01T00:00:00.000Z',
  validUntil: '2026-10-31T00:00:00.000Z',
};

function setup(): Harness {
  return createHarness({
    org: ORG,
    lifecycles: [
      authorizationRequestLifecycle as unknown as Lifecycle<LifecycleTypes>,
      budgetGrantLifecycle as unknown as Lifecycle<LifecycleTypes>,
    ],
    parameters: {
      authorizationRequests: {
        conflictingMatters: [['priceException', 'fixedPrice']],
      },
    },
  });
}

interface Ask {
  readonly matter: string;
  readonly subjectId?: string;
  readonly applicantId?: string;
  readonly scope?: Partial<GrantScope>;
  readonly supersedes?: string;
}

async function draft(h: Harness, ask: Ask): Promise<RecordId> {
  const applicantId = ask.applicantId ?? 'carl';
  const record = await h.create(
    'authorizationRequests',
    {
      subjectId: ask.subjectId ?? 'contract-7',
      subjectRevision: 3,
      matter: ask.matter,
      applicantId,
      requested: { ...OCTOBER, ...ask.scope },
      supersedes: ask.supersedes ?? null,
    },
    applicantId,
  );
  return record.id;
}

async function submitted(h: Harness, ask: Ask): Promise<RecordId> {
  const id = await draft(h, ask);
  await h.fire(
    'authorizationRequests',
    id,
    'submit',
    {},
    ask.applicantId ?? 'carl',
  );
  return id;
}

async function granted(
  h: Harness,
  ask: Ask,
  limitCents?: number,
): Promise<BudgetGrant> {
  const id = await submitted(h, ask);
  const request = (await h.fire(
    'authorizationRequests',
    id,
    'approve',
    limitCents === undefined ? {} : { limitCents },
    'dana',
  )) as AuthorizationRequest;
  return h.get('budgetGrants', request.grantId ?? '') as BudgetGrant;
}

function grant(h: Harness, id: RecordId): BudgetGrant {
  return h.get('budgetGrants', id) as BudgetGrant;
}

async function consume(
  h: Harness,
  grantId: RecordId,
  amountCents: number,
  usageKey: string,
  options: Omit<FireOptions, 'actor' | 'input'> & {
    actor?: string;
    subjectRevision?: number;
  } = {},
): Promise<BudgetGrant> {
  const { actor = 'carl', subjectRevision = 3, ...rest } = options;
  return (await h.fire(
    'budgetGrants',
    grantId,
    'consume',
    { amountCents, usageKey, subjectId: 'contract-7', subjectRevision },
    actor,
    rest,
  )) as BudgetGrant;
}

describe('scenario 28: approvals with a scope of use', () => {
  describe('an approval produces a grant', () => {
    it('approving writes the grant in the same transaction, with the scope as approved', async () => {
      const h = setup();
      const g = await granted(h, { matter: 'budget' }, 60_000);
      expect(g).toMatchObject({
        status: 'active',
        holderId: 'carl',
        approvedBy: 'dana',
        limitCents: 60_000,
        usedCents: 0,
        subjectRevision: 3,
      });
      const request = h.all('authorizationRequests')[0] as AuthorizationRequest;
      expect(request).toMatchObject({ status: 'approved', grantId: g.id });
    });

    it('an approval may lower the limit asked for, not raise it; a refused approval writes no grant', async () => {
      const h = setup();
      const id = await submitted(h, { matter: 'budget' });
      await expect(
        h.fire(
          'authorizationRequests',
          id,
          'approve',
          { limitCents: 200_000 },
          'dana',
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(h.all('budgetGrants')).toEqual([]);
      expect(h.get('authorizationRequests', id).status).toBe('pending');
    });

    it('limitation: a grant written in the approval transaction has no creation entry in its own history', async () => {
      const h = setup();
      const g = await granted(h, { matter: 'budget' });
      expect(await h.history('budgetGrants', g.id)).toEqual([]);
      // Its origin is the request's approval entry instead.
      expect(await h.history('authorizationRequests', g.requestId)).toEqual([
        '$create',
        'submit',
        'approve',
      ]);
    });
  });

  describe('an amount limit used in parts', () => {
    it('draws from the grant until the limit, then the grant is exhausted', async () => {
      const h = setup();
      const g = await granted(h, { matter: 'budget' });
      expect((await consume(h, g.id, 30_000, 'po-1')).status).toBe('active');
      expect((await consume(h, g.id, 50_000, 'po-2')).usedCents).toBe(80_000);
      const done = await consume(h, g.id, 20_000, 'po-3');
      expect(done).toMatchObject({
        status: 'exhausted',
        usedCents: 100_000,
        uses: 3,
      });
      await expect(consume(h, g.id, 1, 'po-4')).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
    });

    it('a use over what is left is refused and changes nothing', async () => {
      const h = setup();
      const g = await granted(h, { matter: 'budget' });
      await consume(h, g.id, 70_000, 'po-1');
      await expect(consume(h, g.id, 40_000, 'po-2')).rejects.toMatchObject({
        blockers: [{ code: 'overLimit' }],
      });
      expect(grant(h, g.id)).toMatchObject({ usedCents: 70_000, uses: 1 });
    });

    it('a stale reader cannot overspend: the second use at the same version meets CONFLICT, and read again, the limit', async () => {
      const h = setup();
      const g = await granted(h, { matter: 'budget' });
      const shown = grant(h, g.id).lifecycleVersion;
      await consume(h, g.id, 60_000, 'po-1', { expect: { version: shown } });
      await expect(
        consume(h, g.id, 60_000, 'po-2', { expect: { version: shown } }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      // Retried on a fresh read, the same use is judged against what is left.
      await expect(consume(h, g.id, 60_000, 'po-2')).rejects.toMatchObject({
        blockers: [{ code: 'overLimit' }],
      });
      expect(grant(h, g.id).usedCents).toBe(60_000);
    });

    it('the same use twice draws once: a repeated request replays, a new request with the same use key is refused', async () => {
      const h = setup();
      const g = await granted(h, { matter: 'budget' });
      await consume(h, g.id, 10_000, 'po-1', { requestId: 'click-1' });
      await consume(h, g.id, 10_000, 'po-1', { requestId: 'click-1' });
      expect(grant(h, g.id).usedCents).toBe(10_000);
      await expect(
        consume(h, g.id, 10_000, 'po-1', { requestId: 'click-2' }),
      ).rejects.toMatchObject({
        blockers: [{ code: 'alreadyUsed' }],
      });
    });

    it('only the holder can use the grant', async () => {
      const h = setup();
      const g = await granted(h, { matter: 'budget' });
      await expect(
        consume(h, g.id, 1_000, 'po-1', { actor: 'erin' }),
      ).rejects.toMatchObject({
        blockers: [{ code: 'holderOnly' }],
      });
    });
  });

  describe('a use count and a validity window', () => {
    it('a grant for two uses is exhausted by the second', async () => {
      const h = setup();
      const g = await granted(h, {
        matter: 'priceException',
        scope: { limitCents: null, maxUses: 2 },
      });
      expect((await consume(h, g.id, 5_000, 'order-1')).status).toBe('active');
      expect((await consume(h, g.id, 5_000, 'order-2')).status).toBe(
        'exhausted',
      );
    });

    it('a grant cannot be used before its window opens', async () => {
      const h = setup();
      const g = await granted(h, {
        matter: 'budget',
        scope: {
          validFrom: '2026-11-01T00:00:00.000Z',
          validUntil: '2026-12-01T00:00:00.000Z',
        },
      });
      await expect(consume(h, g.id, 1_000, 'po-1')).rejects.toMatchObject({
        blockers: [{ code: 'notYetValid' }],
      });
      h.advance({ days: 31 });
      expect((await consume(h, g.id, 1_000, 'po-1')).usedCents).toBe(1_000);
    });

    it('the expiry sweep expires grants by their own date, and a second sweep finds nothing left', async () => {
      const h = setup();
      const short = await granted(h, {
        matter: 'budget',
        scope: { validUntil: '2026-10-05T00:00:00.000Z' },
      });
      const long = await granted(h, { matter: 'paymentTerms' });
      h.advance({ days: 5 });
      expect(await expireDueGrants(h.runtime, h.services, h.now())).toEqual({
        expired: [String(short.id)],
        skipped: [],
      });
      expect(grant(h, short.id).status).toBe('expired');
      expect(grant(h, long.id).status).toBe('active');
      expect(await expireDueGrants(h.runtime, h.services, h.now())).toEqual({
        expired: [],
        skipped: [],
      });
    });

    it('an expiry fired again under the same request id replays rather than fails', async () => {
      const h = setup();
      const g = await granted(h, {
        matter: 'budget',
        scope: { validUntil: '2026-10-02T00:00:00.000Z' },
      });
      h.advance({ days: 1 });
      await expireDueGrants(h.runtime, h.services, h.now());
      const again = await h.runtime.fire('budgetGrants', g.id, 'expire', {
        actor: { id: 'system', system: true },
        requestId: `expire:${String(g.id)}`,
      });
      expect(again.replayed).toBe(true);
    });

    it('the sweep cannot expire a grant early: the guard checks the date again', async () => {
      const h = setup();
      const g = await granted(h, { matter: 'budget' });
      await expect(
        h.fire(
          'budgetGrants',
          g.id,
          'expire',
          {},
          { id: 'system', system: true },
        ),
      ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    });

    it('limitation: between its date and the next sweep an expired grant still reads active, though no use passes', async () => {
      const h = setup();
      const g = await granted(h, {
        matter: 'budget',
        scope: { validUntil: '2026-10-02T00:00:00.000Z' },
      });
      h.advance({ days: 2 });
      expect(grant(h, g.id).status).toBe('active');
      await expect(consume(h, g.id, 1_000, 'po-1')).rejects.toMatchObject({
        blockers: [{ code: 'expired' }],
      });
      // A trigger cannot do it: `after` sees the parameters, not the record.
      expect(await h.runtime.runTriggers()).toBe(0);
    });
  });

  describe('revocation by authority', () => {
    it('a grant authority revokes with a reason, and the grant cannot be used again', async () => {
      const h = setup();
      const g = await granted(h, { matter: 'budget' });
      await consume(h, g.id, 10_000, 'po-1');
      const revoked = (await h.fire(
        'budgetGrants',
        g.id,
        'revoke',
        { reason: 'Project cancelled' },
        'gary',
      )) as BudgetGrant;
      expect(revoked).toMatchObject({
        status: 'revoked',
        revokedBy: 'gary',
        usedCents: 10_000,
      });
      await expect(consume(h, g.id, 1_000, 'po-2')).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
    });

    it('the approver may revoke too; the holder may not', async () => {
      const h = setup();
      const g = await granted(h, { matter: 'budget' });
      await expect(
        h.fire('budgetGrants', g.id, 'revoke', { reason: 'Mine' }, 'carl'),
      ).rejects.toMatchObject({ blockers: [{ code: 'authorityOnly' }] });
      expect(
        (
          await h.fire(
            'budgetGrants',
            g.id,
            'revoke',
            { reason: 'Wrong scope' },
            'dana',
          )
        ).status,
      ).toBe('revoked');
    });
  });

  describe('a new approval superseding an old one', () => {
    it('a request that names the grant it replaces supersedes it once approved', async () => {
      const h = setup();
      const old = await granted(h, { matter: 'budget' });
      await consume(h, old.id, 40_000, 'po-1');
      const successor = await granted(h, {
        matter: 'budget',
        supersedes: String(old.id),
        scope: { limitCents: 300_000 },
      });
      expect(grant(h, old.id)).toMatchObject({
        status: 'superseded',
        supersededBy: successor.id,
        usedCents: 40_000,
      });
      expect(successor).toMatchObject({
        status: 'active',
        limitCents: 300_000,
        usedCents: 0,
      });
    });

    it('a second request for a granted matter that does not say it supersedes is refused', async () => {
      const h = setup();
      await granted(h, { matter: 'budget' });
      const id = await draft(h, { matter: 'budget' });
      await expect(
        h.fire('authorizationRequests', id, 'submit', {}, 'carl'),
      ).rejects.toMatchObject({
        blockers: [{ code: 'activeGrant' }],
      });
    });

    it('limitation: until the supersede effect lands, the old grant reads active; its guard refuses use because it sees the successor', async () => {
      const h = setup();
      const old = await granted(h, { matter: 'budget' });
      // As if the approval committed and its effect has not run yet.
      h.store.insertRecord(SCENARIO_COLLECTIONS.budgetGrants, {
        ...grant(h, old.id),
        id: 'grant-new',
        supersedes: old.id,
      });
      expect(grant(h, old.id).status).toBe('active');
      await expect(consume(h, old.id, 1_000, 'po-1')).rejects.toMatchObject({
        blockers: [{ code: 'superseded' }],
      });
    });
  });

  describe('several matters on one subject', () => {
    it('a price exception and payment terms on one contract are granted and used side by side', async () => {
      const h = setup();
      const price = await granted(h, {
        matter: 'priceException',
        scope: { limitCents: null, maxUses: 3 },
      });
      const terms = await granted(h, {
        matter: 'paymentTerms',
        scope: { limitCents: null, maxUses: 1 },
      });
      await consume(h, price.id, 1, 'order-1');
      expect(grant(h, terms.id).uses).toBe(0);
      expect((await consume(h, terms.id, 1, 'invoice-1')).status).toBe(
        'exhausted',
      );
      expect(grant(h, price.id).status).toBe('active');
    });

    it('a duplicate submission of the same matter is refused while the first is pending', async () => {
      const h = setup();
      const first = await submitted(h, { matter: 'paymentTerms' });
      const second = await draft(h, {
        matter: 'paymentTerms',
        applicantId: 'erin',
      });
      await expect(
        h.fire('authorizationRequests', second, 'submit', {}, 'erin'),
      ).rejects.toMatchObject({
        blockers: [{ code: 'duplicateRequest' }],
      });
      // Once the first is rejected, the matter may be asked again.
      await h.fire(
        'authorizationRequests',
        first,
        'reject',
        { reason: 'Not now' },
        'dana',
      );
      expect(
        (await h.fire('authorizationRequests', second, 'submit', {}, 'erin'))
          .status,
      ).toBe('pending');
    });

    it('the same matter on another contract is a different request', async () => {
      const h = setup();
      await submitted(h, { matter: 'paymentTerms' });
      const other = await submitted(h, {
        matter: 'paymentTerms',
        subjectId: 'contract-8',
      });
      expect(h.get('authorizationRequests', other).status).toBe('pending');
    });
  });

  describe('conflicting approvals', () => {
    it('a request conflicting with a standing grant is refused at submission', async () => {
      const h = setup();
      await granted(h, { matter: 'fixedPrice' });
      const id = await draft(h, { matter: 'priceException' });
      await expect(
        h.fire('authorizationRequests', id, 'submit', {}, 'carl'),
      ).rejects.toMatchObject({
        blockers: [{ code: 'conflictingGrant' }],
      });
    });

    it('two conflicting requests may both wait; approving one blocks approving the other', async () => {
      const h = setup();
      const price = await submitted(h, { matter: 'priceException' });
      const fixed = await submitted(h, {
        matter: 'fixedPrice',
        applicantId: 'erin',
      });
      await h.fire('authorizationRequests', price, 'approve', {}, 'dana');
      await expect(
        h.fire('authorizationRequests', fixed, 'approve', {}, 'dana'),
      ).rejects.toMatchObject({
        blockers: [{ code: 'conflictingGrant' }],
      });
      expect(await h.allowed('authorizationRequests', fixed, 'dana')).toEqual([
        'reject',
      ]);
    });

    it('limitation: the duplicate check is a guard, not a constraint; a row written around it is caught only at approval', async () => {
      const h = setup();
      const first = await submitted(h, { matter: 'budget' });
      // An import or a concurrent submission the guard did not see.
      h.store.insertRecord(AUTHORIZATION_REQUESTS, {
        ...h.get('authorizationRequests', first),
        id: 'imported-1',
      });
      expect(
        h
          .all('authorizationRequests')
          .filter((row) => row.status === 'pending' && row.matter === 'budget'),
      ).toHaveLength(2);
      await h.fire('authorizationRequests', first, 'approve', {}, 'dana');
      await expect(
        h.fire('authorizationRequests', 'imported-1', 'approve', {}, 'dana'),
      ).rejects.toMatchObject({
        blockers: [{ code: 'activeGrant' }],
      });
    });
  });

  describe('a business change after approval', () => {
    it('a use on a later revision of the subject is refused; the change needs a new approval', async () => {
      const h = setup();
      const g = await granted(h, { matter: 'budget' });
      await expect(
        consume(h, g.id, 1_000, 'po-1', { subjectRevision: 4 }),
      ).rejects.toMatchObject({
        blockers: [{ code: 'subjectChanged' }],
      });
    });
  });
});
