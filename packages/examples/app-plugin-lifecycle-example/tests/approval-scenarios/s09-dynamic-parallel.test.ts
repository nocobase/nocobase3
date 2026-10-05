// Scenario 9: the departments a purchase needs follow from its items, each
// department reviews in parallel under its own policy, and the request
// waits for them all.
import {
  defineLifecycle,
  LifecycleError,
  SYSTEM_ACTOR,
  type Lifecycle,
  type LifecycleRecord,
  type LifecycleTypes,
} from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import { approvalLifecycle } from '../../server/approval-scenarios/approval/lifecycle.js';
import {
  SINGLE,
  type ApprovalPolicy,
} from '../../server/approval-scenarios/approval/policy.js';
import {
  coordinationValues,
  summarize,
  type CoordinationStrategy,
} from '../../server/approval-scenarios/coordination.js';
import {
  purchasePlanner,
  PURCHASE_STRATEGY,
  type DepartmentReview,
} from '../../server/approval-scenarios/coordination-plans.js';
import type { ScenarioServices } from '../../server/approval-scenarios/services.js';
import {
  workItemLifecycle,
  workItemValues,
} from '../../server/approval-scenarios/work-item.js';
import {
  approvalChild,
  approvalStages,
  branch,
  decideBranch,
  ORG,
  parent,
  refusal,
  setup,
  started,
} from './coordination-fixtures.js';
import { createHarness, type Harness } from './harness.js';

function single(key: string, title: string, role: string): ApprovalPolicy {
  return {
    title,
    currentVersion: 'v1',
    versions: {
      v1: () => [
        { key, title, resolver: { kind: 'role', role }, rule: SINGLE },
      ],
    },
  };
}

function policies(): Record<string, ApprovalPolicy> {
  return {
    purchaseIt: single('it', 'IT', 'it'),
    purchaseSecurity: single('security', 'Information security', 'security'),
    purchaseFacilities: single('facilities', 'Administration', 'facilities'),
    // Legal reviews in two steps of its own: a reviewer, then the lead.
    purchaseLegal: {
      title: 'Legal',
      currentVersion: 'v1',
      versions: {
        v1: () => [
          {
            key: 'legalReview',
            title: 'Legal review',
            resolver: { kind: 'people', people: ['legalA'] },
            rule: SINGLE,
          },
          {
            key: 'legalLead',
            title: 'Legal lead',
            resolver: { kind: 'role', role: 'legalLead' },
            rule: SINGLE,
          },
        ],
      },
    },
  };
}

function categories(): Map<string, DepartmentReview> {
  return new Map<string, DepartmentReview>([
    ['server', { department: 'it', title: 'IT', approvalKind: 'purchaseIt' }],
    [
      'software',
      {
        department: 'security',
        title: 'Information security',
        approvalKind: 'purchaseSecurity',
      },
    ],
    [
      'customerData',
      { department: 'legal', title: 'Legal', approvalKind: 'purchaseLegal' },
    ],
    [
      'furniture',
      {
        department: 'facilities',
        title: 'Administration',
        approvalKind: 'purchaseFacilities',
      },
    ],
  ]);
}

const SERVER = { category: 'server', name: 'Rack server', amount: 30_000 };
const SOFTWARE = { category: 'software', name: 'EDR licences', amount: 8_000 };
const DATA = { category: 'customerData', name: 'CRM data feed', amount: 5_000 };
const STATIONERY = { category: 'stationery', name: 'Pens', amount: 50 };

function purchase(map: Map<string, DepartmentReview> = categories()): Harness {
  return setup(
    { purchase: purchasePlanner(map, new Set(['stationery'])) },
    policies(),
  );
}

describe('scenario 9 · dynamic department parallel approval', () => {
  it('the departments follow from the items: server, software and customer data start IT, security and legal at once', async () => {
    const h = purchase();
    const record = await started(h, 'purchase', {
      items: [SERVER, SOFTWARE, DATA],
    });
    expect(record.status).toBe('running');
    expect(record.branches.map((b) => [b.key, b.kind, b.required])).toEqual([
      ['it', 'approval', true],
      ['security', 'approval', true],
      ['legal', 'approval', true],
    ]);
    // Each department reviews only its own items.
    expect(branch(record, 'it').content).toMatchObject({
      items: [SERVER],
      amount: 30_000,
    });
    for (const key of ['it', 'security', 'legal'])
      expect(approvalChild(h, record, key).status).toBe('inReview');
    expect(h.messagesTo('itA')).toHaveLength(1);
    expect(h.messagesTo('secA')).toHaveLength(1);
    expect(h.messagesTo('legalA')).toHaveLength(1);
    expect(record.notes).toContain('it: Items server are reviewed by IT.');
  });

  it('variant · one opinion per department: the request completes once the last required department approves', async () => {
    const h = purchase();
    const record = await started(h, 'purchase', { items: [SERVER, SOFTWARE] });
    await decideBranch(h, record, 'it', 'itA');
    expect(parent(h, record.id).status).toBe('running');
    expect(summarize(parent(h, record.id))).toMatchObject({
      approvals: { it: 'approved', security: 'inReview' },
      open: ['security'],
    });
    await decideBranch(h, record, 'security', 'secA');
    const done = parent(h, record.id);
    expect(done).toMatchObject({
      status: 'completed',
      outcome: {
        result: 'completed',
        note: 'Every required branch succeeded.',
      },
    });
    expect(h.messagesTo('zhang')).toContain('purchase of zhang: completed');
  });

  it('variant · a department runs its own multi-step review: legal returns internally, the others and the request are untouched', async () => {
    const h = purchase();
    const record = await started(h, 'purchase', { items: [SERVER, DATA] });
    await decideBranch(h, record, 'it', 'itA');
    await decideBranch(h, record, 'legal', 'legalA');
    const before = parent(h, record.id);
    await h.fire(
      'approvalRequests',
      branch(record, 'legal').id,
      'returnTo',
      { target: 'legalReview', reason: 'Check the DPA.' },
      'legalLead',
    );
    // An internal return settles nothing, so the parent hears nothing.
    expect(parent(h, record.id).lifecycleVersion).toBe(before.lifecycleVersion);
    expect(approvalChild(h, record, 'legal').status).toBe('inReview');
    expect(
      (await approvalStages(h, record, 'legal')).map((stage) => stage.status),
    ).toEqual(['active', 'pending']);
    expect(approvalChild(h, record, 'it').status).toBe('approved');
    await decideBranch(h, record, 'legal', 'legalA');
    await decideBranch(h, record, 'legal', 'legalLead');
    expect(parent(h, record.id).status).toBe('completed');
  });

  it('variant · no department needed: stationery completes at once, and the record says why', async () => {
    const h = purchase();
    const record = await started(h, 'purchase', { items: [STATIONERY] });
    expect(record).toMatchObject({ status: 'completed', branches: [] });
    expect(record.outcome?.note).toBe(
      'No branch is needed. Pens (stationery) needs no department review.',
    );
    expect(h.all('approvalRequests')).toEqual([]);
  });

  it('variant · a new category: unknown ones are refused, not let through; once mapped, only requests started afterwards plan it', async () => {
    const map = categories();
    const h = purchase(map);
    const inFlight = await started(h, 'purchase', { items: [SERVER] });
    const draft = await h.create(
      'coordinations',
      coordinationValues({
        kind: 'purchase',
        title: 'Printers',
        applicantId: 'zhang',
        content: {
          items: [
            SERVER,
            { category: 'printer', name: 'Printer', amount: 900 },
          ],
        },
      }),
      'zhang',
    );
    const refused = await refusal(
      h.fire('coordinations', draft.id, 'start', {}, 'zhang'),
    );
    expect(refused).toMatchObject({
      code: 'GUARD_REJECTED',
      message: 'No department reviews the category "printer".',
    });

    map.set('printer', {
      department: 'facilities',
      title: 'Administration',
      approvalKind: 'purchaseFacilities',
    });
    const planned = await h.fire(
      'coordinations',
      draft.id,
      'start',
      {},
      'zhang',
    );
    expect(parent(h, planned.id).branches.map((b) => b.key)).toEqual([
      'it',
      'facilities',
    ]);
    // The plan is on the record: the request started before is unchanged.
    expect(parent(h, inFlight.id).branches.map((b) => b.key)).toEqual(['it']);
  });

  it('strategy · cancelOpen: one department rejects, the request fails and the other departments are cancelled', async () => {
    const h = purchase();
    const record = await started(h, 'purchase', {
      items: [SERVER, SOFTWARE, DATA],
    });
    await decideBranch(h, record, 'it', 'itA');
    await decideBranch(h, record, 'security', 'secA', 'reject');
    const failed = parent(h, record.id);
    expect(failed).toMatchObject({
      status: 'failed',
      outcome: { result: 'failed', note: 'Branch "security" ended rejected.' },
    });
    expect(approvalChild(h, record, 'legal')).toMatchObject({
      status: 'cancelled',
      outcomeNote: 'The request is failed.',
    });
    // Legal's open decision ended with it.
    expect(
      (await approvalStages(h, record, 'legal'))[0].tasks.map((task) => [
        task.assigneeId,
        task.status,
        task.closeReason,
      ]),
    ).toEqual([['legalA', 'voided', 'The request is failed.']]);
    // An approval already given stays; it is not rewritten by the failure.
    expect(approvalChild(h, record, 'it').status).toBe('approved');
    // The legal reviewer's open page is refused.
    expect(
      (await refusal(decideBranch(h, record, 'legal', 'legalA'))).code,
    ).toBe('INVALID_STATE');
    expect(h.messagesTo('zhang')).toContain('purchase of zhang: failed');
  });

  it('strategy · letOpenFinish: the request fails at once, legal still gives its opinion, and it is recorded without changing the outcome', async () => {
    const h = purchase();
    const strategy: CoordinationStrategy = {
      ...PURCHASE_STRATEGY,
      onFailure: 'letOpenFinish',
    };
    const record = await started(
      h,
      'purchase',
      { items: [SOFTWARE, DATA] },
      { strategy },
    );
    await decideBranch(h, record, 'security', 'secA', 'reject');
    expect(parent(h, record.id).status).toBe('failed');
    expect(approvalChild(h, record, 'legal').status).toBe('inReview');
    await decideBranch(h, record, 'legal', 'legalA');
    await decideBranch(h, record, 'legal', 'legalLead');
    const after = parent(h, record.id);
    expect(after).toMatchObject({
      status: 'failed',
      outcome: { result: 'failed' },
    });
    expect(after.lateResults).toMatchObject([
      { key: 'legal', from: 'inReview', to: 'approved' },
    ]);
    // The applicant hears each department's own outcome too; the request's outcome is told once.
    expect(
      h
        .messagesTo('zhang')
        .filter((subject) => subject.startsWith('purchase of zhang: ')),
    ).toEqual(['purchase of zhang: failed']);
  });

  it('strategy · atLeast: two of three departments suffice; one rejection is not the end while two approvals can still come', async () => {
    const h = purchase();
    const strategy: CoordinationStrategy = {
      ...PURCHASE_STRATEGY,
      rule: { kind: 'atLeast', count: 2 },
    };
    const record = await started(
      h,
      'purchase',
      { items: [SERVER, SOFTWARE, DATA] },
      { strategy },
    );
    await decideBranch(h, record, 'security', 'secA', 'reject');
    expect(parent(h, record.id).status).toBe('running');
    await decideBranch(h, record, 'it', 'itA');
    expect(parent(h, record.id).status).toBe('running');
    await decideBranch(h, record, 'legal', 'legalA');
    await decideBranch(h, record, 'legal', 'legalLead');
    expect(parent(h, record.id)).toMatchObject({
      status: 'completed',
      outcome: { note: '2 of the required 2 branches succeeded.' },
    });
  });

  it('strategy · atLeast fails as soon as the count can no longer be reached', async () => {
    const h = purchase();
    const strategy: CoordinationStrategy = {
      ...PURCHASE_STRATEGY,
      rule: { kind: 'atLeast', count: 2 },
    };
    const record = await started(
      h,
      'purchase',
      { items: [SERVER, SOFTWARE, DATA] },
      { strategy },
    );
    await decideBranch(h, record, 'security', 'secA', 'reject');
    await decideBranch(h, record, 'it', 'itA', 'reject');
    expect(parent(h, record.id)).toMatchObject({
      status: 'failed',
      outcome: { note: 'At most 1 branches can succeed; 2 are required.' },
    });
    expect(approvalChild(h, record, 'legal').status).toBe('cancelled');
  });

  it('strategy · an optional department is consulted but not waited for', async () => {
    const map = categories();
    map.set('furniture', {
      department: 'facilities',
      title: 'Administration',
      approvalKind: 'purchaseFacilities',
      required: false,
    });
    const h = purchase(map);
    const record = await started(h, 'purchase', {
      items: [SERVER, { category: 'furniture', name: 'Desk', amount: 400 }],
    });
    await decideBranch(h, record, 'it', 'itA');
    expect(parent(h, record.id).status).toBe('completed');
    expect(approvalChild(h, record, 'facilities').status).toBe('inReview');
    await decideBranch(h, record, 'facilities', 'facA', 'reject');
    expect(parent(h, record.id)).toMatchObject({
      status: 'completed',
      lateResults: [{ key: 'facilities', to: 'rejected' }],
    });
  });

  it('strategy · a content change re-plans: a new department joins, a removed one is cancelled, an unchanged one keeps its approval', async () => {
    const h = purchase();
    const record = await started(h, 'purchase', { items: [SERVER, SOFTWARE] });
    const itBefore = branch(record, 'it');
    await decideBranch(h, record, 'it', 'itA');
    const revised = await h.fire(
      'coordinations',
      record.id,
      'revise',
      { content: { items: [SERVER, DATA] } },
      'zhang',
    );
    const after = parent(h, revised.id);
    expect(after.branches.map((b) => [b.key, b.id, b.state])).toEqual([
      ['it', itBefore.id, 'approved'],
      ['legal', `${String(record.id)}-legal-r2`, 'inReview'],
    ]);
    expect(after.superseded.map((b) => b.key)).toEqual(['security']);
    expect(
      h.get('approvalRequests', branch(record, 'security').id),
    ).toMatchObject({
      status: 'cancelled',
      outcomeNote: 'Superseded by revision 2.',
    });
    expect(approvalChild(h, after, 'legal').status).toBe('inReview');
    await decideBranch(h, after, 'legal', 'legalA');
    await decideBranch(h, after, 'legal', 'legalLead');
    expect(parent(h, record.id).status).toBe('completed');
  });

  it('strategy · a department whose items changed decides again on a new request; its old approval is voided by cancellation', async () => {
    const h = purchase();
    const record = await started(h, 'purchase', { items: [SERVER, SOFTWARE] });
    await decideBranch(h, record, 'it', 'itA');
    await h.fire(
      'coordinations',
      record.id,
      'revise',
      { content: { items: [{ ...SERVER, amount: 90_000 }, SOFTWARE] } },
      'zhang',
    );
    const after = parent(h, record.id);
    expect(branch(after, 'it')).toMatchObject({
      id: `${String(record.id)}-it-r2`,
      state: 'draft',
      revision: 2,
    });
    expect(branch(after, 'security').id).toBe(branch(record, 'security').id);
    expect(approvalChild(h, after, 'it').status).toBe('inReview');
    // The superseded child had already been approved: it stays approved, as history.
    expect(h.get('approvalRequests', branch(record, 'it').id).status).toBe(
      'approved',
    );
    expect(after.notes.at(-1)).toBe(
      'Revision 2 by zhang: kept [security], new [it], superseded [it].',
    );
  });

  it('correctness · a repeated signal is a replay and a signal after the outcome cannot reopen it', async () => {
    const h = purchase();
    const record = await started(h, 'purchase', { items: [SERVER] });
    await decideBranch(h, record, 'it', 'itA');
    const done = parent(h, record.id);
    expect(done.status).toBe('completed');
    const child = approvalChild(h, record, 'it');
    const again = await h.runtime.fire(
      'coordinations',
      record.id,
      'branchSettled',
      {
        actor: SYSTEM_ACTOR,
        input: {
          lifecycle: 'approvalRequests',
          id: String(child.id),
          state: 'approved',
        },
        requestId: `approvalRequests:${String(child.id)}:approved:1`,
      },
    );
    expect(again.replayed).toBe(true);
    await h.fire('coordinations', record.id, 'branchSettled', {}, SYSTEM_ACTOR);
    expect(parent(h, record.id)).toMatchObject({
      status: 'completed',
      outcome: done.outcome,
      lateResults: [],
    });
    // Only the system signals.
    expect(
      (
        await refusal(
          h.fire('coordinations', record.id, 'branchSettled', {}, 'zhang'),
        )
      ).code,
    ).toBe('GUARD_REJECTED');
  });

  it("limitation: children inserted in the parent's transaction have no $create entry; their history starts at submit", async () => {
    const h = purchase();
    const record = await started(h, 'purchase', { items: [SERVER] });
    expect(
      await h.history('approvalRequests', branch(record, 'it').id),
    ).toEqual(['submit']);
    expect(await h.history('coordinations', record.id)).toEqual([
      '$create',
      'start',
    ]);
  });

  it('limitation: route cannot await, so one signal is two transitions — branchSettled records the children, conclude decides', async () => {
    const h = purchase();
    const record = await started(h, 'purchase', { items: [SERVER] });
    await decideBranch(h, record, 'it', 'itA');
    const { transitions } = await h.runtime.history('coordinations', record.id);
    expect(
      transitions
        .slice(-2)
        .map((entry) => [entry.transition, entry.from, entry.to]),
    ).toEqual([
      ['branchSettled', 'running', 'running'],
      ['conclude', 'running', 'completed'],
    ]);
  });

  it('limitation: a signal a guard refuses is swallowed by notifyParent; the parent stays running until the reconcile sweep re-reads its children', async () => {
    const h = purchase();
    h.runtime.addGuard(
      'coordinations',
      'branchSettled',
      ({ input }) =>
        Object.keys(input).length === 0 || 'Frozen by another plugin.',
    );
    const record = await started(h, 'purchase', { items: [SERVER] });
    await decideBranch(h, record, 'it', 'itA');
    expect(approvalChild(h, record, 'it').status).toBe('approved');
    expect(parent(h, record.id).status).toBe('running');
    const runs = await h.runtime.listEffectRuns({
      effect: 'approvalRequests.notifyParent',
    });
    expect(runs.map((run) => [run.status, run.result])).toEqual([
      ['succeeded', { parent: String(record.id), ignored: 'GUARD_REJECTED' }],
    ]);
    h.advance({ hours: 23 });
    await h.runtime.runTriggers();
    expect(parent(h, record.id).status).toBe('running');
    h.advance({ hours: 2 });
    await h.runtime.runTriggers();
    expect(parent(h, record.id).status).toBe('completed');
  });

  it("limitation: a CONFLICT on the parent is retried by the child's notifyParent run, which re-reads every child on the next attempt", async () => {
    const h = purchase();
    let conflicts = 1;
    h.runtime.addGuard('coordinations', 'branchSettled', () => {
      if (conflicts-- > 0)
        throw new LifecycleError(
          'CONFLICT',
          'Another branch settled at the same moment.',
        );
      return true;
    });
    const record = await started(h, 'purchase', { items: [SERVER] });
    await decideBranch(h, record, 'it', 'itA');
    expect(parent(h, record.id).status).toBe('completed');
    const [run] = await h.runtime.listEffectRuns({
      effect: 'approvalRequests.notifyParent',
    });
    expect(run).toMatchObject({ status: 'succeeded', attempts: 2 });
  });

  it('limitation: once every notifyParent attempt fails, the child is approved and the parent still running until retryRun or the sweep', async () => {
    const h = purchase();
    let broken = true;
    h.runtime.addGuard('coordinations', 'branchSettled', () => {
      if (broken) throw new Error('The database is unavailable.');
      return true;
    });
    const record = await started(h, 'purchase', { items: [SERVER] });
    await decideBranch(h, record, 'it', 'itA');
    const [run] = await h.runtime.listEffectRuns({
      effect: 'approvalRequests.notifyParent',
    });
    // The in-process dispatcher does not wait out the backoff: five attempts, at once.
    expect(run).toMatchObject({ status: 'failed', attempts: 5 });
    expect(parent(h, record.id).status).toBe('running');
    broken = false;
    await h.runtime.retryRun(run.id);
    expect(parent(h, record.id).status).toBe('completed');
  });

  it('a branch child the system submitted tells its applicant, not "system"', async () => {
    const h = purchase();
    const record = await started(h, 'purchase', { items: [SERVER] });
    await decideBranch(h, record, 'it', 'itA');
    expect(approvalChild(h, record, 'it').submittedBy).toBeNull();
    expect(h.messagesTo('system')).toEqual([]);
    expect(h.messagesTo('zhang')).toContain(`purchase of zhang · IT: approved`);
  });

  it('limitation: firing another transition from inside a transition never returns with the memory store — creation has to be an effect', async () => {
    interface SpawnerTypes {
      record: LifecycleRecord;
      state: 'open' | 'spawned';
      services: ScenarioServices;
    }
    const spawner: Lifecycle<SpawnerTypes> = defineLifecycle<SpawnerTypes>({
      name: 'spawners',
      collection: 'scenarioSpawners',
      initial: 'open',
      states: ['open', { name: 'spawned', final: true }],
      transitions: {
        spawn: {
          from: 'open',
          to: 'spawned',
          onTransition: async ({ services }) => {
            await services.lifecycles.create(
              'workItems',
              workItemValues({
                title: 'Child',
                definition: 'x@v1',
                steps: [],
                ownerRole: 'ops',
                businessKey: 'k',
              }),
              { actor: SYSTEM_ACTOR },
            );
          },
        },
      },
    });
    const h = createHarness({
      org: ORG,
      lifecycles: [
        approvalLifecycle as unknown as Lifecycle<LifecycleTypes>,
        workItemLifecycle as unknown as Lifecycle<LifecycleTypes>,
        spawner as unknown as Lifecycle<LifecycleTypes>,
      ],
    });
    const record = await h.create('spawners', {});
    const outcome = await Promise.race([
      h
        .fire('spawners', record.id, 'spawn', {}, SYSTEM_ACTOR)
        .then(() => 'returned'),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve('still waiting'), 100),
      ),
    ]);
    expect(outcome).toBe('still waiting');
  });
});
