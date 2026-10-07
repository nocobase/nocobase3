// Scenario 9: the departments a purchase needs follow from
// its items; each reviews in parallel as a child record; the purchase waits
// for them through branch rows its children update in their own transitions.
import { describe, expect, it } from 'vitest';

import {
  coordinationNotes,
  PURCHASE_STRATEGY,
  purchasePlanner,
  type CoordinationStrategy,
  type DepartmentReview,
} from '../../server/scenarios/coordination.js';
import {
  BRANCH_REVIEWS,
  branch,
  branches,
  child,
  COORDINATIONS,
  decideBranch,
  parent,
  setup,
  started,
} from '../support/coordination-fixtures.js';
import { refusal, type Harness } from '../support/harness.js';

function categories(): Map<string, DepartmentReview> {
  return new Map<string, DepartmentReview>([
    ['server', { department: 'it', title: 'IT', reviewers: 'it' }],
    [
      'software',
      {
        department: 'security',
        title: 'Information security',
        reviewers: 'security',
      },
    ],
    [
      'customerData',
      {
        department: 'legal',
        title: 'Legal',
        reviewers: ['legalA'],
        lead: 'legalLead',
      },
    ],
    [
      'furniture',
      {
        department: 'facilities',
        title: 'Administration',
        reviewers: 'facilities',
      },
    ],
  ]);
}

const SERVER = { category: 'server', name: 'Rack server', amount: 30_000 };
const SOFTWARE = { category: 'software', name: 'EDR licences', amount: 8_000 };
const DATA = { category: 'customerData', name: 'CRM data feed', amount: 5_000 };
const STATIONERY = { category: 'stationery', name: 'Pens', amount: 50 };

function purchase(map: Map<string, DepartmentReview> = categories()): Harness {
  return setup({ purchase: purchasePlanner(map, new Set(['stationery'])) });
}

describe('scenario 9 · dynamic department parallel approval', () => {
  it('the departments follow from the items, and start in the purchase’s own transaction', async () => {
    const h = purchase();
    const id = await started(h, 'purchase', {
      items: [SERVER, SOFTWARE, DATA],
    });
    expect(parent(h, id).status).toBe('running');
    const rows = await branches(h, id);
    expect(
      rows.map((row) => [row.key, row.kind, row.required, row.child?.status]),
    ).toEqual([
      ['it', 'approval', true, 'approving'],
      ['security', 'approval', true, 'approving'],
      ['legal', 'approval', true, 'approving'],
    ]);
    expect((await child(h, id, 'it')).content).toMatchObject({
      items: [SERVER],
      amount: 30_000,
    });
    // Children are created through their lifecycle: their history starts at $create.
    expect(await h.history(BRANCH_REVIEWS, rows[0].childId)).toEqual([
      '$create',
      'submit',
    ]);
    for (const person of ['itA', 'secA', 'legalA'])
      expect(h.messagesTo(person)).toHaveLength(1);
    expect(parent(h, id).notes).toContain(
      'it: Items server are reviewed by IT.',
    );
  });

  it('one opinion per department: the purchase concludes in the transaction of the last approval', async () => {
    const h = purchase();
    const id = await started(h, 'purchase', { items: [SERVER, SOFTWARE] });
    const before = parent(h, id);
    await decideBranch(h, id, 'it', 'itA');
    // A branch settling moves its row, not the purchase.
    expect(parent(h, id)).toBe(before);
    expect((await branch(h, id, 'it')).state).toBe('approved');
    await decideBranch(h, id, 'security', 'secA');
    expect(parent(h, id)).toMatchObject({
      status: 'completed',
      outcomeNote: 'Every required branch succeeded.',
    });
    expect(await h.history(COORDINATIONS, id)).toEqual([
      '$create',
      'start',
      'conclude',
    ]);
    expect(h.messagesTo('zhang')).toContain('purchase of zhang: completed');
  });

  it('a department runs its own chain: legal returns internally, the others and the purchase are untouched', async () => {
    const h = purchase();
    const id = await started(h, 'purchase', { items: [SERVER, DATA] });
    await decideBranch(h, id, 'it', 'itA');
    await decideBranch(h, id, 'legal', 'legalA');
    const before = parent(h, id);
    const legal = await branch(h, id, 'legal');
    const lead = await h.taskOf(BRANCH_REVIEWS, legal.childId, 'legalLead');
    await h.approvals.returnTo({
      taskId: lead.id,
      actor: { id: 'legalLead' },
      to: 'review',
      reason: 'Check the DPA.',
    });
    expect(parent(h, id)).toBe(before);
    expect((await child(h, id, 'legal')).status).toBe('approving');
    await decideBranch(h, id, 'legal', 'legalA');
    await decideBranch(h, id, 'legal', 'legalLead');
    expect(parent(h, id).status).toBe('completed');
  });

  it('no department needed: stationery completes at once, and the record says why', async () => {
    const h = purchase();
    const id = await started(h, 'purchase', { items: [STATIONERY] });
    expect(parent(h, id)).toMatchObject({
      status: 'completed',
      outcomeNote:
        'No branch is needed. Pens (stationery) needs no department review.',
    });
    expect(await branches(h, id)).toEqual([]);
    expect(h.all(BRANCH_REVIEWS)).toEqual([]);
  });

  it('a new category: unknown ones are refused; once mapped, only requests started afterwards plan it', async () => {
    const map = categories();
    const h = purchase(map);
    const inFlight = await started(h, 'purchase', { items: [SERVER] });
    const draft = await h.create(
      COORDINATIONS,
      {
        kind: 'purchase',
        title: 'Printers',
        applicantId: 'zhang',
        content: {
          items: [
            SERVER,
            { category: 'printer', name: 'Printer', amount: 900 },
          ],
        },
        revision: 0,
        strategy: null,
        notes: [],
        outcomeNote: null,
        outcomeBy: null,
      },
      'zhang',
    );
    expect(
      await refusal(h.fire(COORDINATIONS, draft.id, 'start', {}, 'zhang')),
    ).toMatchObject({
      code: 'GUARD_REJECTED',
      message: 'No department reviews the category "printer".',
    });
    map.set('printer', {
      department: 'facilities',
      title: 'Administration',
      reviewers: 'facilities',
    });
    await h.fire(COORDINATIONS, draft.id, 'start', {}, 'zhang');
    expect((await branches(h, String(draft.id))).map((row) => row.key)).toEqual(
      ['it', 'facilities'],
    );
    expect((await branches(h, inFlight)).map((row) => row.key)).toEqual(['it']);
  });

  it('cancelOpen: one department rejects; in that transaction the purchase fails and the open departments are cancelled', async () => {
    const h = purchase();
    const id = await started(h, 'purchase', {
      items: [SERVER, SOFTWARE, DATA],
    });
    await decideBranch(h, id, 'it', 'itA');
    const legalTask = await h.taskOf(
      BRANCH_REVIEWS,
      (await branch(h, id, 'legal')).childId,
      'legalA',
    );
    await decideBranch(h, id, 'security', 'secA', 'reject');
    expect(parent(h, id)).toMatchObject({
      status: 'failed',
      outcomeNote: 'Branch "security" ended rejected.',
    });
    expect(await child(h, id, 'legal')).toMatchObject({
      status: 'cancelled',
      cancelReason: 'The request is failed.',
    });
    expect(
      await h.open(BRANCH_REVIEWS, (await branch(h, id, 'legal')).childId),
    ).toEqual([]);
    expect((await child(h, id, 'it')).status).toBe('approved');
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: legalTask.id,
            actor: { id: 'legalA' },
            answer: 'approve',
          }),
        )
      ).code,
    ).toBe('TASK_CLOSED');
    expect(h.messagesTo('zhang')).toContain('purchase of zhang: failed');
  });

  it('letOpenFinish: the purchase fails at once; legal still gives its opinion, kept on its row without changing the outcome', async () => {
    const h = purchase();
    const strategy: CoordinationStrategy = {
      ...PURCHASE_STRATEGY,
      onFailure: 'letOpenFinish',
    };
    const id = await started(
      h,
      'purchase',
      { items: [SOFTWARE, DATA] },
      { strategy },
    );
    await decideBranch(h, id, 'security', 'secA', 'reject');
    expect(parent(h, id).status).toBe('failed');
    expect((await child(h, id, 'legal')).status).toBe('approving');
    await decideBranch(h, id, 'legal', 'legalA');
    await decideBranch(h, id, 'legal', 'legalLead');
    expect(parent(h, id)).toMatchObject({ status: 'failed' });
    expect((await branch(h, id, 'legal')).late).toMatchObject([
      { from: 'approving', to: 'approved' },
    ]);
    expect(
      h
        .messagesTo('zhang')
        .filter((subject) => subject.startsWith('purchase of zhang: ')),
    ).toEqual(['purchase of zhang: failed']);
  });

  it('atLeast: two of three suffice; one rejection is not the end while two approvals can still come', async () => {
    const h = purchase();
    const strategy: CoordinationStrategy = {
      ...PURCHASE_STRATEGY,
      rule: { kind: 'atLeast', count: 2 },
    };
    const id = await started(
      h,
      'purchase',
      { items: [SERVER, SOFTWARE, DATA] },
      { strategy },
    );
    await decideBranch(h, id, 'security', 'secA', 'reject');
    expect(parent(h, id).status).toBe('running');
    await decideBranch(h, id, 'it', 'itA');
    await decideBranch(h, id, 'legal', 'legalA');
    await decideBranch(h, id, 'legal', 'legalLead');
    expect(parent(h, id)).toMatchObject({
      status: 'completed',
      outcomeNote: '2 of the required 2 branches succeeded.',
    });
  });

  it('atLeast fails as soon as the count can no longer be reached', async () => {
    const h = purchase();
    const strategy: CoordinationStrategy = {
      ...PURCHASE_STRATEGY,
      rule: { kind: 'atLeast', count: 2 },
    };
    const id = await started(
      h,
      'purchase',
      { items: [SERVER, SOFTWARE, DATA] },
      { strategy },
    );
    await decideBranch(h, id, 'security', 'secA', 'reject');
    await decideBranch(h, id, 'it', 'itA', 'reject');
    expect(parent(h, id)).toMatchObject({
      status: 'failed',
      outcomeNote: 'At most 1 branches can succeed; 2 are required.',
    });
    expect((await child(h, id, 'legal')).status).toBe('cancelled');
  });

  it('an optional department is consulted but not waited for; its later rejection is kept, not applied', async () => {
    const map = categories();
    map.set('furniture', {
      department: 'facilities',
      title: 'Administration',
      reviewers: 'facilities',
      required: false,
    });
    const h = purchase(map);
    const id = await started(h, 'purchase', {
      items: [SERVER, { category: 'furniture', name: 'Desk', amount: 400 }],
    });
    await decideBranch(h, id, 'it', 'itA');
    expect(parent(h, id).status).toBe('completed');
    expect((await child(h, id, 'facilities')).status).toBe('approving');
    await decideBranch(h, id, 'facilities', 'facA', 'reject');
    expect(parent(h, id).status).toBe('completed');
    expect((await branch(h, id, 'facilities')).late).toMatchObject([
      { to: 'rejected' },
    ]);
  });

  it('a content change re-plans: a new department joins, a removed one is cancelled, an unchanged one keeps its approval', async () => {
    const h = purchase();
    const id = await started(h, 'purchase', { items: [SERVER, SOFTWARE] });
    const itBefore = await branch(h, id, 'it');
    const securityBefore = await branch(h, id, 'security');
    await decideBranch(h, id, 'it', 'itA');
    await h.fire(
      COORDINATIONS,
      id,
      'revise',
      { content: { items: [SERVER, DATA] } },
      'zhang',
    );
    const after = (await branches(h, id)).filter(
      (row) => row.status === 'active',
    );
    expect(
      after.map((row) => [
        row.key,
        row.childId === itBefore.childId,
        row.state,
      ]),
    ).toEqual([
      ['it', true, 'approved'],
      ['legal', false, 'approving'],
    ]);
    expect(h.get(BRANCH_REVIEWS, securityBefore.childId)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Superseded by revision 2.',
    });
    expect(await coordinationNotes(h.runtime, id)).toEqual([
      'Revision 2 by zhang: kept [it], new [legal], superseded [security].',
    ]);
    await decideBranch(h, id, 'legal', 'legalA');
    await decideBranch(h, id, 'legal', 'legalLead');
    expect(parent(h, id).status).toBe('completed');
  });

  it('a department whose items changed decides again on a new child; the old approval stays as history', async () => {
    const h = purchase();
    const id = await started(h, 'purchase', { items: [SERVER, SOFTWARE] });
    const itBefore = await branch(h, id, 'it');
    await decideBranch(h, id, 'it', 'itA');
    await h.fire(
      COORDINATIONS,
      id,
      'revise',
      { content: { items: [{ ...SERVER, amount: 90_000 }, SOFTWARE] } },
      'zhang',
    );
    const it = await branch(h, id, 'it');
    expect(it).toMatchObject({ revision: 2, state: 'approving' });
    expect(it.childId).not.toBe(itBefore.childId);
    expect(h.get(BRANCH_REVIEWS, itBefore.childId).status).toBe('approved');
    expect((await branch(h, id, 'it', 1)).status).toBe('superseded');
  });

  it('the conclusion is a system transition no page can fire, and no other signal exists to replay', async () => {
    const h = purchase();
    const id = await started(h, 'purchase', { items: [SERVER] });
    expect(await h.allowed(COORDINATIONS, id, 'zhang')).toEqual([
      'revise',
      'cancel',
    ]);
    expect(
      (await h.runtime.can(COORDINATIONS, id, 'conclude', { id: 'zhang' }))
        .blockers[0]?.code,
    ).toBe('NOT_MANUAL');
    await decideBranch(h, id, 'it', 'itA');
    expect(parent(h, id).status).toBe('completed');
    expect(await h.history(COORDINATIONS, id)).toEqual([
      '$create',
      'start',
      'conclude',
    ]);
  });

  it('a guard another plugin puts on the conclusion refuses the deciding answer with it: nothing is half done', async () => {
    const h = purchase();
    h.runtime.addGuard(
      COORDINATIONS,
      'conclude',
      () => 'Frozen by another plugin.',
    );
    const id = await started(h, 'purchase', { items: [SERVER] });
    const it = await branch(h, id, 'it');
    expect((await refusal(decideBranch(h, id, 'it', 'itA'))).code).toBe(
      'GUARD_REJECTED',
    );
    // The answer, the child's approval and the branch row all rolled back together.
    expect(h.get(BRANCH_REVIEWS, it.childId).status).toBe('approving');
    expect(await h.stage(BRANCH_REVIEWS, it.childId)).toBe('review');
    expect((await branch(h, id, 'it')).state).toBe('approving');
    expect(await h.open(BRANCH_REVIEWS, it.childId)).toEqual(['itA:pending']);
  });

  it('a branch child the system submitted tells its applicant, not "system"', async () => {
    const h = purchase();
    const id = await started(h, 'purchase', { items: [SERVER] });
    await decideBranch(h, id, 'it', 'itA');
    expect(h.messagesTo('system')).toEqual([]);
    expect(h.messagesTo('zhang')).toContain('purchase of zhang · IT: approved');
  });
});
