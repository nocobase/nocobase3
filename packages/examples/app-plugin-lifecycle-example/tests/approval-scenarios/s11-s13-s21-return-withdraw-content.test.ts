// Scenarios 11 (return to the previous stage), 12 (return to the applicant
// or any earlier stage), 13 (withdraw) and 21 (what each decision approved).
import { describe, expect, it } from 'vitest';

import {
  active,
  approvalHarness,
  decide,
  request,
  stages,
  submitted,
  trail,
  versionOf,
} from './approval-fixtures.js';

const CONTRACT = { party: 'ACME', amount: 100_000, terms: 'net 30' };

// The contract policy: manager (party, amount) → legal (party, terms; may
// revise) → finance (amount) → CEO (everything).
async function atFinance() {
  const h = approvalHarness();
  const r = await submitted(h, 'contract', CONTRACT);
  await decide(h, r.id, 'li');
  await decide(h, r.id, 'legalA');
  expect((await active(h, r.id))?.key).toBe('finance');
  return { h, id: r.id };
}

describe('scenario 11: return to the previous stage', () => {
  it('finance returns it to legal; legal decides again, the manager’s approval stands', async () => {
    const { h, id } = await atFinance();
    await h.fire(
      'approvalRequests',
      id,
      'returnTo',
      { target: 'legal', reason: 'Clause 7 is unclear' },
      'finA',
    );
    const back = await stages(h, id);
    expect((await active(h, id))?.key).toBe('legal');
    expect(back[0].status).toBe('approved');
    // Legal's first approval is void but kept, with the reason.
    expect(back[1].voidedVotes.map((vote) => vote.userId)).toEqual(['legalA']);
    expect(back[1].notes.at(-1)).toBe('Returned by finA: Clause 7 is unclear');
    await decide(h, id, 'legalA');
    expect((await active(h, id))?.key).toBe('finance');
  });

  it('legal revises terms itself: what the manager approved is untouched, so it stands', async () => {
    const { h, id } = await atFinance();
    await h.fire(
      'approvalRequests',
      id,
      'returnTo',
      { target: 'legal', reason: 'Clause 7' },
      'finA',
    );
    const revised = await h.fire(
      'approvalRequests',
      id,
      'revise',
      { content: { terms: 'net 45' } },
      'legalA',
    );
    expect(revised).toMatchObject({
      revision: 1,
      content: { ...CONTRACT, terms: 'net 45' },
    });
    expect((await stages(h, id))[0].status).toBe('approved');
    expect((await active(h, id))?.key).toBe('legal');
  });

  it('legal revises the amount: the manager must approve the new amount again', async () => {
    const { h, id } = await atFinance();
    await h.fire(
      'approvalRequests',
      id,
      'returnTo',
      { target: 'legal', reason: 'Price' },
      'finA',
    );
    await h.fire(
      'approvalRequests',
      id,
      'revise',
      { content: { amount: 90_000 } },
      'legalA',
    );
    expect((await active(h, id))?.key).toBe('manager');
    expect((await stages(h, id))[0].notes.at(-1)).toBe(
      'Revision 1 by legalA changed what this stage covered.',
    );
    await decide(h, id, 'li');
    expect((await active(h, id))?.key).toBe('legal');
  });

  it('only a stage allowed to revise may change the content', async () => {
    const { h, id } = await atFinance();
    await expect(
      h.fire(
        'approvalRequests',
        id,
        'revise',
        { content: { amount: 1 } },
        'finA',
      ),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'mayNotRevise' })],
    });
  });

  it('may only return to an earlier stage', async () => {
    const { h, id } = await atFinance();
    await expect(
      h.fire(
        'approvalRequests',
        id,
        'returnTo',
        { target: 'ceo', reason: 'x' },
        'finA',
      ),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'badTarget' })],
    });
  });
});

describe('scenario 12: return to the applicant or to any earlier stage', () => {
  it('the CEO returns it to the applicant; full re-review runs every stage again', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'contractFullReview', CONTRACT);
    await decide(h, r.id, 'li');
    await h.fire(
      'approvalRequests',
      r.id,
      'returnTo',
      { target: 'applicant', reason: 'Wrong party' },
      'finA',
    );
    expect(request(h, r.id).status).toBe('draft');
    h.store.patchRecord('scenarioApprovalRequests', r.id, {
      content: { ...CONTRACT, terms: 'net 60' },
    });
    const again = await h.fire('approvalRequests', r.id, 'submit', {}, 'zhang');
    expect(again).toMatchObject({ round: 2 });
    expect((await active(h, r.id))?.key).toBe('manager');
  });

  it('keeps an approval whose fields did not change, and re-reviews what did', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'contract', CONTRACT);
    await decide(h, r.id, 'li');
    await decide(h, r.id, 'legalA');
    await decide(h, r.id, 'finA');
    await h.fire(
      'approvalRequests',
      r.id,
      'returnTo',
      { target: 'applicant', reason: 'Terms' },
      'ceo',
    );
    h.store.patchRecord('scenarioApprovalRequests', r.id, {
      content: { ...CONTRACT, terms: 'net 60' },
    });
    const again = await h.fire('approvalRequests', r.id, 'submit', {}, 'zhang');
    expect(again.round).toBe(2);
    const planned = await stages(h, r.id);
    expect(planned.map((stage) => stage.status)).toEqual([
      'approved',
      'active',
      'approved',
      'pending',
    ]);
    expect(planned[0].notes.at(-1)).toBe(
      'Round 2: kept from round 1; the fields it covers did not change.',
    );
    // The kept approval still names the round and content it was made on.
    expect(planned[0].votes[0]).toMatchObject({ round: 1 });
    // Round 1's stages stay as they ended: the CEO's turn was cut short.
    expect(
      (await trail(h, r.id)).history.map((stage) => [stage.key, stage.status]),
    ).toEqual([
      ['manager', 'approved'],
      ['legal', 'approved'],
      ['finance', 'approved'],
      ['ceo', 'cancelled'],
    ]);
  });

  it('the CEO returns it to the manager stage: everything from there is decided again', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'contract', CONTRACT);
    for (const person of ['li', 'legalA', 'finA'])
      await decide(h, r.id, person);
    await h.fire(
      'approvalRequests',
      r.id,
      'returnTo',
      { target: 'manager', reason: 'Recheck' },
      'ceo',
    );
    const back = await stages(h, r.id);
    expect(back.map((stage) => stage.status)).toEqual([
      'active',
      'pending',
      'pending',
      'pending',
    ]);
    expect(
      back.flatMap((stage) => stage.voidedVotes.map((vote) => vote.userId)),
    ).toEqual(['li', 'legalA', 'finA']);
  });
});

describe('scenario 13: withdraw', () => {
  it('the applicant withdraws while finance is deciding; finance can no longer act', async () => {
    const { h, id } = await atFinance();
    await h.fire('approvalRequests', id, 'withdraw', {}, 'zhang');
    expect(request(h, id).status).toBe('draft');
    await expect(decide(h, id, 'finA')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    // Earlier decisions stay as history.
    expect((await stages(h, id))[0].votes[0].userId).toBe('li');
    // Finance's to-do ended with the round, and says why.
    expect((await stages(h, id))[2]).toMatchObject({
      key: 'finance',
      status: 'cancelled',
      notes: ['Withdrawn by zhang.'],
    });
  });

  it('withdraw and approve at the same moment: exactly one of them wins', async () => {
    const { h, id } = await atFinance();
    const seen = versionOf(request(h, id));
    await h.fire('approvalRequests', id, 'withdraw', {}, 'zhang', {
      expect: { version: seen },
    });
    await expect(
      decide(h, id, 'finA', 'approve', 'OK', { version: seen }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('a click on the old notification after resubmission does not land on the new round', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveTiered', { days: 2 });
    const seen = versionOf(r);
    await h.fire('approvalRequests', r.id, 'withdraw', {}, 'zhang');
    await h.fire('approvalRequests', r.id, 'submit', {}, 'zhang');
    expect(request(h, r.id).round).toBe(2);
    await expect(
      decide(h, r.id, 'li', 'approve', 'OK', { version: seen }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('only the applicant or the submitter may withdraw', async () => {
    const { h, id } = await atFinance();
    await expect(
      h.fire('approvalRequests', id, 'withdraw', {}, 'li'),
    ).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
  });

  it('limitation: without the page’s version, a stale click on an unchanged resubmission is accepted', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveTiered', { days: 2 });
    await h.fire('approvalRequests', r.id, 'withdraw', {}, 'zhang');
    await h.fire('approvalRequests', r.id, 'submit', {}, 'zhang');
    // Same content, same hash: only `expect.version` tells the two rounds apart.
    const done = await decide(h, r.id, 'li', 'approve', 'OK', {
      contentHash: r.contentHash ?? '',
    });
    expect(done.status).toBe('approved');
  });
});

describe('scenario 21: what each decision approved', () => {
  it('binds every vote to the round, revision and content hash it was made on', async () => {
    const { h, id } = await atFinance();
    const r = request(h, id);
    expect((await stages(h, id))[0].votes[0]).toMatchObject({
      round: 1,
      revision: 0,
      contentHash: r.contentHash,
    });
    expect((await trail(h, id)).submission?.content).toEqual(CONTRACT);
  });

  it('refuses a decision made on a page that showed other content', async () => {
    const { h, id } = await atFinance();
    const shown = request(h, id).contentHash ?? '';
    await h.fire(
      'approvalRequests',
      id,
      'returnTo',
      { target: 'legal', reason: 'x' },
      'finA',
    );
    await h.fire(
      'approvalRequests',
      id,
      'revise',
      { content: { terms: 'net 45' } },
      'legalA',
    );
    await expect(
      decide(h, id, 'legalA', 'approve', 'OK', { contentHash: shown }),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'staleContent' })],
    });
  });

  it('the applicant cannot change content under review; only a return or withdrawal opens it', async () => {
    const { h, id } = await atFinance();
    expect(await h.allowed('approvalRequests', id, 'zhang')).toEqual([
      'withdraw',
    ]);
  });

  it('the transition log keeps who, when and the input of every step', async () => {
    const { h, id } = await atFinance();
    const log = (await h.runtime.history('approvalRequests', id)).transitions;
    expect(log.map((entry) => [entry.transition, entry.actorId])).toEqual([
      ['$create', 'zhang'],
      ['submit', 'zhang'],
      ['decide', 'li'],
      ['decide', 'legalA'],
    ]);
  });
});
