// Scenarios 14 (hand over and add signers), 15 (delegation) and 16
// (reassignment by an administrator after someone leaves).
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

describe('scenario 14: hand over and add signers', () => {
  it('hand over: A no longer holds it, B decides', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'legalReview', {});
    await h.fire(
      'approvalRequests',
      r.id,
      'transfer',
      { to: 'lawyer', reason: 'Needs a specialist' },
      'legalA',
    );
    expect((await active(h, r.id))?.assignees[0]).toMatchObject({
      userId: 'lawyer',
      via: 'transfer',
    });
    await expect(decide(h, r.id, 'legalA')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    await decide(h, r.id, 'lawyer');
    expect((await active(h, r.id))?.key).toBe('legalLead');
  });

  it('add before: B decides first, then it comes back to A', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'legalReview', {});
    await h.fire(
      'approvalRequests',
      r.id,
      'addSigner',
      { userId: 'lawyer', mode: 'before' },
      'legalA',
    );
    expect(await assignees(h, r.id)).toEqual(['lawyer']);
    await expect(decide(h, r.id, 'legalA')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    await decide(h, r.id, 'lawyer');
    expect(await active(h, r.id)).toMatchObject({ key: 'legal' });
    expect(await assignees(h, r.id)).toEqual(['legalA']);
    await decide(h, r.id, 'legalA');
    expect((await active(h, r.id))?.key).toBe('legalLead');
  });

  it('add after: A approves, and B must approve too', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'legalReview', {});
    await h.fire(
      'approvalRequests',
      r.id,
      'addSigner',
      { userId: 'lawyer', mode: 'after' },
      'legalA',
    );
    await decide(h, r.id, 'legalA');
    expect(await assignees(h, r.id)).toEqual(['lawyer']);
    await decide(h, r.id, 'lawyer');
    expect((await active(h, r.id))?.key).toBe('legalLead');
  });

  it('add alongside: A and B both have to approve', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'legalReview', {});
    await h.fire(
      'approvalRequests',
      r.id,
      'addSigner',
      { userId: 'lawyer', mode: 'parallel' },
      'legalA',
    );
    await decide(h, r.id, 'legalA');
    expect((await active(h, r.id))?.key).toBe('legal');
    await decide(h, r.id, 'lawyer');
    expect((await active(h, r.id))?.key).toBe('legalLead');
  });

  it('a kind of request that takes no added signers refuses them', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveTiered', { days: 1 });
    await expect(
      h.fire(
        'approvalRequests',
        r.id,
        'addSigner',
        { userId: 'wang', mode: 'after' },
        'li',
      ),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'noAddSigner' })],
    });
  });

  it('limitation: an added signer may add more signers; no depth or cycle limit is built in', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'legalReview', {});
    await h.fire(
      'approvalRequests',
      r.id,
      'addSigner',
      { userId: 'lawyer', mode: 'before' },
      'legalA',
    );
    await h.fire(
      'approvalRequests',
      r.id,
      'addSigner',
      { userId: 'legalB', mode: 'before' },
      'lawyer',
    );
    await h.fire(
      'approvalRequests',
      r.id,
      'addSigner',
      { userId: 'lawyer', mode: 'before' },
      'legalB',
    );
    expect((await stages(h, r.id)).map((stage) => stage.key)).toHaveLength(5);
  });
});

describe('scenario 15: delegation while away', () => {
  function away(
    h: ReturnType<typeof approvalHarness>,
    overrides: Partial<Parameters<typeof h.org.delegate>[0]> = {},
  ) {
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

  it('the delegate decides for the principal, and both are recorded', async () => {
    const h = approvalHarness();
    away(h);
    const r = await submitted(h, 'leaveTiered', { days: 1 });
    const done = await decide(h, r.id, 'wang');
    expect(done.status).toBe('approved');
    expect((await stages(h, r.id))[0].votes[0]).toMatchObject({
      userId: 'li',
      actorId: 'wang',
    });
  });

  it('a delegation for new work only does not reach older work', async () => {
    const h = approvalHarness({ now: '2026-09-29T09:00:00Z' });
    const r = await submitted(h, 'leaveTiered', { days: 1 });
    h.advance({ days: 3 });
    away(h, { coversExisting: false });
    await expect(decide(h, r.id, 'wang')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
  });

  it('covers only the kinds it names', async () => {
    const h = approvalHarness();
    away(h, { kinds: ['purchaseChain'] });
    const r = await submitted(h, 'leaveTiered', { days: 1 });
    await expect(decide(h, r.id, 'wang')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
  });

  it('does not chain: the delegate’s own delegate cannot act for the principal', async () => {
    const h = approvalHarness();
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
    const r = await submitted(h, 'leaveTiered', { days: 1 });
    await expect(decide(h, r.id, 'vp')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
  });

  it('stops when it is revoked or expires, checked at the moment of acting', async () => {
    const h = approvalHarness();
    away(h);
    const r = await submitted(h, 'leaveTiered', { days: 1 });
    expect(await h.allowed('approvalRequests', r.id, 'wang')).toContain(
      'decide',
    );
    h.advance({ days: 20 });
    expect(await h.allowed('approvalRequests', r.id, 'wang')).not.toContain(
      'decide',
    );
  });

  it('never lets the applicant decide their own request as a delegate', async () => {
    const h = approvalHarness();
    away(h, { to: 'zhang' });
    const r = await submitted(h, 'leaveTiered', { days: 1 });
    await expect(decide(h, r.id, 'zhang')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
  });

  it('a delegate may decide but not hand the responsibility on', async () => {
    const h = approvalHarness();
    away(h);
    const r = await submitted(h, 'leaveTiered', { days: 1 });
    await expect(
      h.fire('approvalRequests', r.id, 'transfer', { to: 'zhao' }, 'wang'),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
  });
});

describe('scenario 16: reassignment after someone leaves', () => {
  it('moves every open item of a departed approver, reporting what could not move', async () => {
    const h = approvalHarness();
    const items = await Promise.all(
      [1, 2, 3, 4].map(() => submitted(h, 'financeSingle', {})),
    );
    // One finA already decided on: that decision stands and is not moved.
    const decided = await submitted(h, 'financeAny', {});
    await decide(h, decided.id, 'finA', 'reject');
    h.org.deactivate('finA');
    const results: { id: unknown; ok: boolean; code?: string }[] = [];
    for (const item of [...items, decided]) {
      try {
        await h.fire(
          'approvalRequests',
          item.id,
          'reassign',
          { from: 'finA', to: 'finB', reason: 'finA left' },
          'admin',
          {
            requestId: `batch-1:${String(item.id)}`,
          },
        );
        results.push({ id: item.id, ok: true });
      } catch (error) {
        results.push({
          id: item.id,
          ok: false,
          code: (error as { blockers?: { code: string }[] }).blockers?.[0]
            ?.code,
        });
      }
    }
    expect(results.filter((result) => result.ok)).toHaveLength(4);
    expect(results.at(-1)).toMatchObject({ ok: false, code: 'alreadyDecided' });
    for (const item of items)
      expect(await assignees(h, item.id)).toEqual(['finB']);
  });

  it('a retried batch replays instead of reassigning twice', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeSingle', {});
    const reassign = () =>
      h.fire(
        'approvalRequests',
        r.id,
        'reassign',
        { from: 'finA', to: 'finB', reason: 'left' },
        'admin',
        { requestId: 'batch-1:x' },
      );
    await reassign();
    const before = versionOf(request(h, r.id));
    await reassign();
    expect(versionOf(request(h, r.id))).toBe(before);
  });

  it('the right to reassign is not the right to approve', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeSingle', {});
    await expect(decide(h, r.id, 'admin')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
  });

  it('refuses an unqualified replacement unless the override is explicit and explained', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeSingle', {});
    await expect(
      h.fire(
        'approvalRequests',
        r.id,
        'reassign',
        { from: 'finA', to: 'zhao', reason: 'left' },
        'admin',
      ),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'unqualified' })],
    });
    await h.fire(
      'approvalRequests',
      r.id,
      'reassign',
      {
        from: 'finA',
        to: 'zhao',
        reason: 'left, CFO approved',
        override: true,
      },
      'admin',
    );
    expect((await active(h, r.id))?.assignees[0].note).toBe(
      'Reassigned by admin: left, CFO approved (qualification overridden).',
    );
  });

  it('reassignment and the original approver’s decision racing: one wins', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeSingle', {});
    const seen = versionOf(r);
    await decide(h, r.id, 'finA', 'approve', 'OK', { version: seen });
    await expect(
      h.fire(
        'approvalRequests',
        r.id,
        'reassign',
        { from: 'finA', to: 'finB', reason: 'left' },
        'admin',
        { expect: { version: seen } },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('an idle approver is passed up after the configured wait', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveAtSubmit', { days: 1 });
    await decide(h, r.id, 'li');
    expect(await assignees(h, r.id)).toEqual(['li']);
    h.advance({ hours: 73 });
    expect(await h.runtime.runTriggers()).toBe(1);
    expect((await active(h, r.id))?.assignees[0]).toMatchObject({
      userId: 'wang',
      via: 'escalate',
    });
  });
});
