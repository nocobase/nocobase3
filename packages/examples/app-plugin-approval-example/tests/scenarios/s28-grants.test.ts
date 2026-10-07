// Scenario 28: approvals that grant a scope, and its use.
import { SYSTEM_ACTOR } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  balance,
  expireDueGrants,
  grantApproval,
  grantLifecycle,
  grantRequestLifecycle,
  GRANT_REQUESTS,
  GRANTS,
  consumeGrant,
  type Grant,
  type GrantScope,
} from '../../server/scenarios/grant.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

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
    lifecycles: [grantRequestLifecycle as never, grantLifecycle as never],
    approvals: [grantApproval as never],
    parameters: {
      [GRANT_REQUESTS]: {
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

async function draft(h: Harness, ask: Ask): Promise<string> {
  const applicantId = ask.applicantId ?? 'carl';
  const record = await h.create(
    GRANT_REQUESTS,
    {
      subjectId: ask.subjectId ?? 'contract-7',
      subjectRevision: 3,
      matter: ask.matter,
      applicantId,
      requested: { ...OCTOBER, ...ask.scope },
      supersedes: ask.supersedes ?? null,
      approved: null,
      grantId: null,
    },
    applicantId,
  );
  return String(record.id);
}

async function submitted(h: Harness, ask: Ask): Promise<string> {
  const id = await draft(h, ask);
  await h.fire(GRANT_REQUESTS, id, 'submit', {}, ask.applicantId ?? 'carl');
  return id;
}

const grantOf = (h: Harness, requestId: string): Grant =>
  h.all(GRANTS).find((row) => row.requestId === requestId) as Grant;

async function granted(h: Harness, ask: Ask): Promise<Grant> {
  const id = await submitted(h, ask);
  await h.answer(GRANT_REQUESTS, id, 'dana');
  return grantOf(h, id);
}

async function approveWith(
  h: Harness,
  id: string,
  data: Record<string, number>,
) {
  const task = await h.taskOf(GRANT_REQUESTS, id, 'dana');
  return h.approvals.respond({
    taskId: task.id,
    actor: { id: 'dana' },
    answer: 'approve',
    data,
  });
}

const consume = (
  h: Harness,
  grantId: string,
  amountCents: number,
  usageKey: string,
  extra: {
    actor?: string;
    subjectRevision?: number;
    requestId?: string;
    expectBalance?: number;
  } = {},
) =>
  consumeGrant(h.runtime, {
    grantId,
    actor: { id: extra.actor ?? 'carl' },
    amountCents,
    usageKey,
    subjectId: 'contract-7',
    subjectRevision: extra.subjectRevision ?? 3,
    ...(extra.requestId === undefined ? {} : { requestId: extra.requestId }),
    ...(extra.expectBalance === undefined
      ? {}
      : { expectBalance: extra.expectBalance }),
  });

/** Why a use was refused: the grant layer's own reason. */
const reason = async (promise: Promise<unknown>): Promise<string> => {
  const error = (await refusal(promise)) as unknown as {
    reason?: string;
    code: string;
  };
  return error.reason ?? error.code;
};

describe('scenario 28 · an approval produces a grant', () => {
  it('the grant is created through its lifecycle in the approving transaction, with the scope as approved', async () => {
    const h = setup();
    const id = await submitted(h, { matter: 'budget' });
    await approveWith(h, id, { limitCents: 60_000 });
    const g = grantOf(h, id);
    expect(g).toMatchObject({
      status: 'active',
      holderId: 'carl',
      approvedBy: 'dana',
      limitCents: 60_000,
      subjectRevision: 3,
    });
    expect(h.get(GRANT_REQUESTS, id)).toMatchObject({
      status: 'approved',
      approved: { limitCents: 60_000 },
    });
    // Created through its lifecycle: its history starts at $create.
    expect(await h.history(GRANTS, g.id)).toEqual(['$create']);
  });

  it('an approval may lower the limit, not raise it; a refused approval writes no grant and keeps the task open', async () => {
    const h = setup();
    const id = await submitted(h, { matter: 'budget' });
    expect(
      (await refusal(approveWith(h, id, { limitCents: 200_000 }))).code,
    ).toBe('INVALID_STATE');
    expect(h.all(GRANTS)).toEqual([]);
    expect(await h.stage(GRANT_REQUESTS, id)).toBe('approval');
    expect(await h.open(GRANT_REQUESTS, id)).toEqual(['dana:pending']);
  });
});

describe('scenario 28 · an amount used in parts, as rows of the grant’s second layer', () => {
  it('draws until the limit; the use that spends the last exhausts the grant in its own transaction', async () => {
    const h = setup();
    const g = await granted(h, { matter: 'budget' });
    const before = h.get(GRANTS, g.id);
    expect((await consume(h, String(g.id), 30_000, 'po-1')).state).toBe(
      'active',
    );
    expect(
      (await consume(h, String(g.id), 50_000, 'po-2')).balance.usedCents,
    ).toBe(80_000);
    // Two uses, and the grant itself never moved.
    expect(h.get(GRANTS, g.id)).toBe(before);
    expect(await consume(h, String(g.id), 20_000, 'po-3')).toMatchObject({
      state: 'exhausted',
      balance: { usedCents: 100_000, uses: 3 },
    });
    expect(await reason(consume(h, String(g.id), 1, 'po-4'))).toBe('notActive');
  });

  it('a use over what is left is refused and changes nothing', async () => {
    const h = setup();
    const g = await granted(h, { matter: 'budget' });
    await consume(h, String(g.id), 70_000, 'po-1');
    expect(await reason(consume(h, String(g.id), 40_000, 'po-2'))).toBe(
      'overLimit',
    );
    expect(await balance(h.runtime, g.id)).toMatchObject({
      usedCents: 70_000,
      uses: 1,
    });
  });

  it('a stale reader cannot overspend: the balance row serializes uses', async () => {
    const h = setup();
    const g = await granted(h, { matter: 'budget' });
    const shown = (await balance(h.runtime, g.id)).rowVersion;
    await consume(h, String(g.id), 60_000, 'po-1', { expectBalance: shown });
    expect(
      (
        await refusal(
          consume(h, String(g.id), 60_000, 'po-2', { expectBalance: shown }),
        )
      ).code,
    ).toBe('CONFLICT');
    expect(await reason(consume(h, String(g.id), 60_000, 'po-2'))).toBe(
      'overLimit',
    );
  });

  it('the same use twice draws once: a repeated request replays, a new request with the same key is refused', async () => {
    const h = setup();
    const g = await granted(h, { matter: 'budget' });
    await consume(h, String(g.id), 10_000, 'po-1', { requestId: 'click-1' });
    expect(
      (await consume(h, String(g.id), 10_000, 'po-1', { requestId: 'click-1' }))
        .outcome,
    ).toBe('replayed');
    expect((await balance(h.runtime, g.id)).usedCents).toBe(10_000);
    expect(
      await reason(
        consume(h, String(g.id), 10_000, 'po-1', { requestId: 'click-2' }),
      ),
    ).toBe('alreadyUsed');
  });

  it('only the holder uses it; a use on a later revision of the subject is refused', async () => {
    const h = setup();
    const g = await granted(h, { matter: 'budget' });
    expect(
      await reason(consume(h, String(g.id), 1_000, 'po-1', { actor: 'erin' })),
    ).toBe('holderOnly');
    expect(
      await reason(
        consume(h, String(g.id), 1_000, 'po-1', { subjectRevision: 4 }),
      ),
    ).toBe('subjectChanged');
  });
});

describe('scenario 28 · uses and a validity window', () => {
  it('a grant for two uses is exhausted by the second', async () => {
    const h = setup();
    const g = await granted(h, {
      matter: 'priceException',
      scope: { limitCents: null, maxUses: 2 },
    });
    expect((await consume(h, String(g.id), 5_000, 'order-1')).state).toBe(
      'active',
    );
    expect((await consume(h, String(g.id), 5_000, 'order-2')).state).toBe(
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
    expect(await reason(consume(h, String(g.id), 1_000, 'po-1'))).toBe(
      'notYetValid',
    );
    h.advance({ days: 31 });
    expect(
      (await consume(h, String(g.id), 1_000, 'po-1')).balance.usedCents,
    ).toBe(1_000);
  });

  it('the expiry sweep expires grants by their own date; the guard checks the date again', async () => {
    const h = setup();
    const short = await granted(h, {
      matter: 'budget',
      scope: { validUntil: '2026-10-05T00:00:00.000Z' },
    });
    const long = await granted(h, { matter: 'paymentTerms' });
    await expect(
      h.runtime.fire(GRANTS, short.id, 'expire', { actor: SYSTEM_ACTOR }),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    h.advance({ days: 5 });
    expect(
      await expireDueGrants(h.runtime, h.all(GRANTS) as Grant[], h.now()),
    ).toEqual([String(short.id)]);
    expect(h.get(GRANTS, long.id).status).toBe('active');
    const again = await h.runtime.fire(GRANTS, short.id, 'expire', {
      actor: SYSTEM_ACTOR,
      requestId: `expire:${String(short.id)}`,
    });
    expect(again.replayed).toBe(true);
  });

  it('limitation: between its date and the next sweep an expired grant still reads active, though no use passes', async () => {
    const h = setup();
    const g = await granted(h, {
      matter: 'budget',
      scope: { validUntil: '2026-10-02T00:00:00.000Z' },
    });
    h.advance({ days: 2 });
    expect(h.get(GRANTS, g.id).status).toBe('active');
    expect(await reason(consume(h, String(g.id), 1_000, 'po-1'))).toBe(
      'expired',
    );
  });
});

describe('scenario 28 · revocation and supersession', () => {
  it('a grant authority or the approver revokes with a reason; the holder may not', async () => {
    const h = setup();
    const g = await granted(h, { matter: 'budget' });
    await consume(h, String(g.id), 10_000, 'po-1');
    await expect(
      h.fire(GRANTS, g.id, 'revoke', { reason: 'Mine' }, 'carl'),
    ).rejects.toMatchObject({ blockers: [{ code: 'authorityOnly' }] });
    await h.fire(
      GRANTS,
      g.id,
      'revoke',
      { reason: 'Project cancelled' },
      'gary',
    );
    expect(h.get(GRANTS, g.id)).toMatchObject({
      status: 'revoked',
      revokedBy: 'gary',
    });
    expect(await reason(consume(h, String(g.id), 1_000, 'po-2'))).toBe(
      'notActive',
    );
  });

  it('a request naming the grant it replaces supersedes it in the approving transaction', async () => {
    const h = setup();
    const old = await granted(h, { matter: 'budget' });
    await consume(h, String(old.id), 40_000, 'po-1');
    const successor = await granted(h, {
      matter: 'budget',
      supersedes: String(old.id),
      scope: { limitCents: 300_000 },
    });
    expect(h.get(GRANTS, old.id)).toMatchObject({
      status: 'superseded',
      supersededBy: String(successor.id),
    });
    expect(successor).toMatchObject({ status: 'active', limitCents: 300_000 });
    // Nothing in between reads the old grant as active: no supersede effect to wait for.
    expect(await reason(consume(h, String(old.id), 1_000, 'po-2'))).toBe(
      'notActive',
    );
  });

  it('a second request for a granted matter that does not say it supersedes is refused', async () => {
    const h = setup();
    await granted(h, { matter: 'budget' });
    const id = await draft(h, { matter: 'budget' });
    await expect(
      h.fire(GRANT_REQUESTS, id, 'submit', {}, 'carl'),
    ).rejects.toMatchObject({ blockers: [{ code: 'activeGrant' }] });
  });
});

describe('scenario 28 · several matters on one subject', () => {
  it('a price exception and payment terms are granted and used side by side', async () => {
    const h = setup();
    const price = await granted(h, {
      matter: 'priceException',
      scope: { limitCents: null, maxUses: 3 },
    });
    const terms = await granted(h, {
      matter: 'paymentTerms',
      scope: { limitCents: null, maxUses: 1 },
    });
    await consume(h, String(price.id), 1, 'order-1');
    expect((await consume(h, String(terms.id), 1, 'invoice-1')).state).toBe(
      'exhausted',
    );
    expect(h.get(GRANTS, price.id).status).toBe('active');
  });

  it('a duplicate submission of the same matter is refused while the first is pending', async () => {
    const h = setup();
    const first = await submitted(h, { matter: 'paymentTerms' });
    const second = await draft(h, {
      matter: 'paymentTerms',
      applicantId: 'erin',
    });
    await expect(
      h.fire(GRANT_REQUESTS, second, 'submit', {}, 'erin'),
    ).rejects.toMatchObject({ blockers: [{ code: 'duplicateRequest' }] });
    await h.answer(GRANT_REQUESTS, first, 'dana', 'reject', 'Not now');
    await h.fire(GRANT_REQUESTS, second, 'submit', {}, 'erin');
    expect(await h.stage(GRANT_REQUESTS, second)).toBe('approval');
  });

  it('two conflicting requests may both wait; approving one blocks approving the other, and the refused answer is undone', async () => {
    const h = setup();
    const price = await submitted(h, { matter: 'priceException' });
    const fixed = await submitted(h, {
      matter: 'fixedPrice',
      applicantId: 'erin',
    });
    await h.answer(GRANT_REQUESTS, price, 'dana');
    expect((await refusal(h.answer(GRANT_REQUESTS, fixed, 'dana'))).code).toBe(
      'GUARD_REJECTED',
    );
    expect(await h.open(GRANT_REQUESTS, fixed)).toEqual(['dana:pending']);
    await h.answer(
      GRANT_REQUESTS,
      fixed,
      'dana',
      'reject',
      'Conflicts with the price exception.',
    );
    expect(h.get(GRANT_REQUESTS, fixed).status).toBe('rejected');
  });

  it('a grant written around the submission check is still caught when the approval concludes', async () => {
    const h = setup();
    const first = await submitted(h, { matter: 'budget' });
    // An import the submission guard never saw.
    h.store.insertRecord(GRANTS, {
      ...OCTOBER,
      requestId: 'imported',
      subjectId: 'contract-7',
      subjectRevision: 3,
      matter: 'budget',
      holderId: 'carl',
      approvedBy: 'dana',
      supersedes: null,
      status: 'active',
      statusChangedAt: h.now().toISOString(),
      lifecycleVersion: 1,
    });
    expect((await refusal(h.answer(GRANT_REQUESTS, first, 'dana'))).code).toBe(
      'GUARD_REJECTED',
    );
  });
});
