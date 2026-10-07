// Scenario 10: a launch waits for three reviews with chains of
// their own and an operations preparation that is work, not an opinion.
import { describe, expect, it } from 'vitest';

import {
  LAUNCH_STRATEGY,
  launchPlanner,
  remindCoordinations,
  type CoordinationStrategy,
} from '../../server/scenarios/coordination.js';
import {
  BRANCH_REVIEWS,
  branch,
  branches,
  child,
  decideBranch,
  parent,
  setup,
  started,
  work,
  WORK_ITEMS,
} from '../support/coordination-fixtures.js';
import { refusal, type Harness } from '../support/harness.js';

const CONTENT = { product: 'Atlas', launchDate: '2026-11-01', budget: 120_000 };

function launch(): Harness {
  return setup({ launch: launchPlanner() });
}

async function approveSecurity(h: Harness, id: string): Promise<void> {
  await decideBranch(h, id, 'security', 'secEng');
  await decideBranch(h, id, 'security', 'secLead');
}

async function approveLegal(h: Harness, id: string): Promise<void> {
  await decideBranch(h, id, 'legal', 'legalA');
  await decideBranch(h, id, 'legal', 'legalB');
  await decideBranch(h, id, 'legal', 'legalLead');
}

function remind(h: Harness): Promise<number> {
  return remindCoordinations(h.runtime, {
    org: h.org,
    outbox: {
      send: (to: string, subject: string, key: string) =>
        void h.sent.push({ to, subject, key }),
    },
  } as never);
}

describe('scenario 10 · cross-department parallel approval with internal chains', () => {
  it('the launch runs four branches; opinions and preparation results are apart', async () => {
    const h = launch();
    const id = await started(h, 'launch', CONTENT);
    expect(
      (await branches(h, id)).map((row) => [
        row.key,
        row.kind,
        row.childLifecycle,
        row.state,
      ]),
    ).toEqual([
      ['security', 'approval', BRANCH_REVIEWS, 'approving'],
      ['legal', 'approval', BRANCH_REVIEWS, 'approving'],
      ['finance', 'approval', BRANCH_REVIEWS, 'approving'],
      ['ops', 'preparation', WORK_ITEMS, 'done'],
    ]);
    expect(await work(h, id, 'ops')).toMatchObject({
      status: 'done',
      definition: 'launchPreparation@v1',
    });
    expect(parent(h, id).status).toBe('running');
  });

  it('each department runs its own chain; the launch completes in the transaction of the last approval', async () => {
    const h = launch();
    const id = await started(h, 'launch', CONTENT);
    const legal = (await branch(h, id, 'legal')).childId;
    await decideBranch(h, id, 'legal', 'legalA');
    expect((await child(h, id, 'legal')).status).toBe('approving');
    expect(await h.stage(BRANCH_REVIEWS, legal)).toBe('review');
    await decideBranch(h, id, 'legal', 'legalB');
    // The chain is the child's run: the child still only waits.
    expect((await child(h, id, 'legal')).status).toBe('approving');
    expect(await h.stage(BRANCH_REVIEWS, legal)).toBe('lead');
    await decideBranch(h, id, 'legal', 'legalLead');
    await approveSecurity(h, id);
    expect(parent(h, id).status).toBe('running');
    await decideBranch(h, id, 'finance', 'finA');
    expect(parent(h, id)).toMatchObject({
      status: 'completed',
      outcomeNote: 'Every required branch succeeded.',
    });
  });

  it("an internal return redoes legal's countersign; security's review and the launch are untouched", async () => {
    const h = launch();
    const id = await started(h, 'launch', CONTENT);
    await approveSecurity(h, id);
    await decideBranch(h, id, 'legal', 'legalA');
    await decideBranch(h, id, 'legal', 'legalB');
    const before = parent(h, id);
    const legal = await branch(h, id, 'legal');
    const lead = await h.taskOf(BRANCH_REVIEWS, legal.childId, 'legalLead');
    await h.approvals.returnTo({
      taskId: lead.id,
      actor: { id: 'legalLead' },
      to: 'review',
      reason: 'Clause 7 changed.',
    });
    expect(parent(h, id)).toBe(before);
    expect(await h.open(BRANCH_REVIEWS, legal.childId)).toEqual([
      'legalA:pending',
      'legalB:pending',
    ]);
    expect((await child(h, id, 'security')).status).toBe('approved');
    await approveLegal(h, id);
    await decideBranch(h, id, 'finance', 'finA');
    expect(parent(h, id).status).toBe('completed');
  });

  it('a branch returned to the applicant waits for them; nobody resubmits it for them', async () => {
    const h = launch();
    const id = await started(h, 'launch', CONTENT);
    const finance = await branch(h, id, 'finance');
    const task = await h.taskOf(BRANCH_REVIEWS, finance.childId, 'finA');
    await h.approvals.returnTo({
      taskId: task.id,
      actor: { id: 'finA' },
      to: 'applicant',
      reason: 'Attach the budget sheet.',
    });
    expect((await child(h, id, 'finance')).status).toBe('draft');
    await approveSecurity(h, id);
    expect((await child(h, id, 'finance')).status).toBe('draft');
    expect((await branch(h, id, 'finance')).state).toBe('draft');
    await h.fire(BRANCH_REVIEWS, finance.childId, 'submit', {}, 'zhang');
    expect((await child(h, id, 'finance')).status).toBe('approving');
    expect(
      (await h.runs(BRANCH_REVIEWS, finance.childId)).map((run) => run.status),
    ).toEqual(['returned', 'review']);
  });

  it('long no response: each branch is reminded by its own idle time, and the engineer’s task escalates', async () => {
    const h = launch();
    const id = await started(h, 'launch', CONTENT);
    h.advance({ hours: 20 });
    await decideBranch(h, id, 'finance', 'finA');
    h.advance({ hours: 5 });
    // Security has been idle 25 hours: the finance answer beside it does not
    // restart its clock, because it never touched the launch.
    expect(await remind(h)).toBeGreaterThan(0);
    expect(h.messagesTo('secEng')).toContain(
      'Reminder: launch of zhang waits for Security review',
    );
    h.advance({ hours: 48 });
    await h.approvals.sweep();
    const security = await branch(h, id, 'security');
    expect(
      (await h.tasks(BRANCH_REVIEWS, security.childId)).at(-1),
    ).toMatchObject({
      assigneeId: 'secLead',
      via: 'escalate',
    });
    expect(parent(h, id).status).toBe('running');
  });

  it('partial completion then failure: finance rejects, open reviews are cancelled and the finished preparation is compensated', async () => {
    const h = launch();
    const id = await started(h, 'launch', CONTENT);
    await approveSecurity(h, id);
    await decideBranch(h, id, 'finance', 'finA', 'reject');
    expect(parent(h, id)).toMatchObject({
      status: 'failed',
      outcomeNote: 'Branch "finance" ended rejected.',
    });
    expect((await child(h, id, 'legal')).status).toBe('cancelled');
    expect((await child(h, id, 'security')).status).toBe('approved');
    const ops = await work(h, id, 'ops');
    expect(ops.status).toBe('rolledBack');
    expect(ops.steps.map((step) => step.status)).toEqual([
      'rolledBack',
      'rolledBack',
    ]);
    expect(h.external.rolledBack).toEqual([
      'configureMonitoring',
      'provisionServers',
    ]);
    expect(await h.history(WORK_ITEMS, ops.id)).toEqual([
      '$create',
      'start',
      'stepDone',
      'stepDone',
      'compensate',
      'rollbackDone',
    ]);
    // Undone after the outcome: kept on the branch row, never applied.
    expect((await branch(h, id, 'ops')).late).toMatchObject([
      { from: 'done', to: 'rollingBack' },
    ]);
    expect((await branch(h, id, 'ops')).state).toBe('rolledBack');
  });

  it('no compensation: a finished preparation stays as it is after the launch fails', async () => {
    const h = launch();
    const strategy: CoordinationStrategy = {
      ...LAUNCH_STRATEGY,
      compensate: false,
    };
    const id = await started(h, 'launch', CONTENT, { strategy });
    await decideBranch(h, id, 'finance', 'finA', 'reject');
    expect(parent(h, id).status).toBe('failed');
    expect((await work(h, id, 'ops')).status).toBe('done');
    expect(h.external.rolledBack).toEqual([]);
  });

  it('a failed preparation fails the launch (onBranchFailure: fail) and cancels the reviews, in the failure’s transaction', async () => {
    const h = launch();
    h.external.outages.set('step:provisionServers', 3);
    const id = await started(h, 'launch', CONTENT);
    expect(parent(h, id)).toMatchObject({
      status: 'failed',
      outcomeNote: 'Branch "ops" ended failed.',
    });
    expect(await work(h, id, 'ops')).toMatchObject({
      status: 'cancelled',
      lastError: 'step:provisionServers is unavailable.',
    });
    expect(h.external.rolledBack).toEqual([]);
    expect((await child(h, id, 'security')).status).toBe('cancelled');
  });

  it('a failed preparation waits for operations (onBranchFailure: wait); their retry repeats only the failed step', async () => {
    const h = launch();
    h.external.outages.set('step:configureMonitoring', 3);
    const strategy: CoordinationStrategy = {
      ...LAUNCH_STRATEGY,
      onBranchFailure: 'wait',
    };
    const id = await started(h, 'launch', CONTENT, { strategy });
    expect(parent(h, id).status).toBe('running');
    expect((await branch(h, id, 'ops')).state).toBe('failed');
    const ops = await branch(h, id, 'ops');
    expect(
      (await refusal(h.fire(WORK_ITEMS, ops.childId, 'retry', {}, 'zhang')))
        .code,
    ).toBe('GUARD_REJECTED');
    await h.fire(WORK_ITEMS, ops.childId, 'retry', {}, 'opsA');
    expect((await work(h, id, 'ops')).status).toBe('done');
    expect(
      h.external.calls.filter((call) =>
        call.startsWith('step:provisionServers'),
      ),
    ).toHaveLength(1);
    expect((await branch(h, id, 'ops')).state).toBe('done');
  });

  it('letOpenFinish with compensation: a preparation that finishes after the launch failed is undone as it reports', async () => {
    const h = launch();
    h.external.outages.set('step:provisionServers', 3);
    const strategy: CoordinationStrategy = {
      ...LAUNCH_STRATEGY,
      onBranchFailure: 'wait',
      onFailure: 'letOpenFinish',
    };
    const id = await started(h, 'launch', CONTENT, { strategy });
    await decideBranch(h, id, 'finance', 'finA', 'reject');
    expect(parent(h, id).status).toBe('failed');
    expect((await child(h, id, 'legal')).status).toBe('approving');
    await h.fire(
      WORK_ITEMS,
      (await branch(h, id, 'ops')).childId,
      'retry',
      {},
      'opsA',
    );
    expect((await work(h, id, 'ops')).status).toBe('rolledBack');
    expect(parent(h, id)).toMatchObject({
      status: 'failed',
      outcomeNote: 'Branch "finance" ended rejected.',
    });
  });
});
