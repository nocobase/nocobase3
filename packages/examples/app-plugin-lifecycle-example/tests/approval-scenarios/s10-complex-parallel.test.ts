// Scenario 10: a product launch waits for security, legal and finance, each
// with its own internal approval chain, and for an operations preparation
// that is work rather than an opinion.
import { describe, expect, it } from 'vitest';

import {
  SINGLE,
  type ApprovalPolicy,
} from '../../server/approval-scenarios/approval/policy.js';
import {
  summarize,
  type CoordinationStrategy,
} from '../../server/approval-scenarios/coordination.js';
import {
  launchPlanner,
  LAUNCH_STRATEGY,
} from '../../server/approval-scenarios/coordination-plans.js';
import {
  approvalChild,
  approvalStages,
  branch,
  decideBranch,
  parent,
  refusal,
  setup,
  started,
  workChild,
} from './coordination-fixtures.js';
import type { Harness } from './harness.js';

function policies(): Record<string, ApprovalPolicy> {
  return {
    launchSecurity: {
      title: 'Security',
      currentVersion: 'v1',
      versions: {
        v1: () => [
          {
            key: 'engineer',
            title: 'Security engineer',
            resolver: { kind: 'people', people: ['secEng'] },
            rule: SINGLE,
            escalate: true,
          },
          {
            key: 'lead',
            title: 'Security lead',
            resolver: { kind: 'role', role: 'secLead' },
            rule: SINGLE,
          },
        ],
      },
    },
    launchLegal: {
      title: 'Legal',
      currentVersion: 'v1',
      versions: {
        v1: () => [
          {
            key: 'countersign',
            title: 'Legal A/B',
            resolver: { kind: 'people', people: ['legalA', 'legalB'] },
            rule: { kind: 'all', onReject: 'immediate' },
          },
          {
            key: 'lead',
            title: 'Legal lead',
            resolver: { kind: 'role', role: 'legalLead' },
            rule: SINGLE,
          },
        ],
      },
    },
    launchFinance: {
      title: 'Finance',
      currentVersion: 'v1',
      versions: {
        v1: () => [
          {
            key: 'finance',
            title: 'Finance',
            resolver: { kind: 'people', people: ['finA'] },
            rule: SINGLE,
          },
        ],
      },
    },
  };
}

const CONTENT = { product: 'Atlas', launchDate: '2026-11-01', budget: 120_000 };

function launch(): Harness {
  return setup({ launch: launchPlanner() }, policies());
}

async function approveSecurity(h: Harness, id: string | number): Promise<void> {
  await decideBranch(h, parent(h, id), 'security', 'secEng');
  await decideBranch(h, parent(h, id), 'security', 'secLead');
}

async function approveLegal(h: Harness, id: string | number): Promise<void> {
  await decideBranch(h, parent(h, id), 'legal', 'legalA');
  await decideBranch(h, parent(h, id), 'legal', 'legalB');
  await decideBranch(h, parent(h, id), 'legal', 'legalLead');
}

describe('scenario 10 · cross-department parallel approval with internal chains', () => {
  it('the launch runs four branches; opinions and preparation results are summarized apart', async () => {
    const h = launch();
    const record = await started(h, 'launch', CONTENT);
    expect(record.branches.map((b) => [b.key, b.kind, b.lifecycle])).toEqual([
      ['security', 'approval', 'approvalRequests'],
      ['legal', 'approval', 'approvalRequests'],
      ['finance', 'approval', 'approvalRequests'],
      ['ops', 'preparation', 'workItems'],
    ]);
    // The preparation ran its steps as soon as it started.
    expect(workChild(h, record, 'ops')).toMatchObject({
      status: 'done',
      definition: 'launchPreparation@v1',
    });
    expect(summarize(parent(h, record.id))).toEqual({
      approvals: {
        security: 'inReview',
        legal: 'inReview',
        finance: 'inReview',
      },
      work: { ops: 'done' },
      open: ['security', 'legal', 'finance'],
      attention: [],
    });
  });

  it('variant · each department runs its own chain: engineer → lead, legal A/B countersign → lead; the launch completes after all', async () => {
    const h = launch();
    const record = await started(h, 'launch', CONTENT);
    await decideBranch(h, record, 'legal', 'legalA');
    expect((await approvalStages(h, record, 'legal'))[0]).toMatchObject({
      key: 'countersign',
      status: 'active',
    });
    await decideBranch(h, record, 'legal', 'legalB');
    expect(
      (await approvalStages(h, record, 'legal')).map((stage) => stage.status),
    ).toEqual(['approved', 'active']);
    await decideBranch(h, record, 'legal', 'legalLead');
    await approveSecurity(h, record.id);
    expect(parent(h, record.id).status).toBe('running');
    await decideBranch(h, record, 'finance', 'finA');
    expect(parent(h, record.id)).toMatchObject({
      status: 'completed',
      outcome: { note: 'Every required branch succeeded.' },
    });
  });

  it("variant · an internal return redoes legal's countersign; security's finished review and the launch itself are untouched", async () => {
    const h = launch();
    const record = await started(h, 'launch', CONTENT);
    await approveSecurity(h, record.id);
    await decideBranch(h, record, 'legal', 'legalA');
    await decideBranch(h, record, 'legal', 'legalB');
    const version = parent(h, record.id).lifecycleVersion;
    await h.fire(
      'approvalRequests',
      branch(record, 'legal').id,
      'returnTo',
      { target: 'countersign', reason: 'Clause 7 changed.' },
      'legalLead',
    );
    expect(parent(h, record.id).lifecycleVersion).toBe(version);
    expect(
      (await approvalStages(h, record, 'legal')).map((stage) => [
        stage.status,
        stage.votes.length,
      ]),
    ).toEqual([
      ['active', 0],
      ['pending', 0],
    ]);
    expect(approvalChild(h, record, 'security').status).toBe('approved');
    await approveLegal(h, record.id);
    await decideBranch(h, record, 'finance', 'finA');
    expect(parent(h, record.id).status).toBe('completed');
  });

  it('variant · a branch returned to the applicant waits for them; the coordinator does not resubmit it on its own', async () => {
    const h = launch();
    const record = await started(h, 'launch', CONTENT);
    await h.fire(
      'approvalRequests',
      branch(record, 'finance').id,
      'returnTo',
      { target: 'applicant', reason: 'Attach the budget sheet.' },
      'finA',
    );
    expect(approvalChild(h, record, 'finance')).toMatchObject({
      status: 'draft',
      round: 1,
    });
    // A later signal from another branch re-syncs the children; a draft of round 1 is left to its applicant.
    await approveSecurity(h, record.id);
    expect(approvalChild(h, record, 'finance').status).toBe('draft');
    await h.fire(
      'approvalRequests',
      branch(record, 'finance').id,
      'submit',
      {},
      'zhang',
    );
    expect(approvalChild(h, record, 'finance')).toMatchObject({
      status: 'inReview',
      round: 2,
    });
  });

  it("variant · long no response: the launch reminds whoever it waits for, and the security engineer's own stage escalates to their manager", async () => {
    const h = launch();
    const record = await started(h, 'launch', CONTENT);
    await approveLegal(h, record.id);
    await decideBranch(h, record, 'finance', 'finA');
    h.advance({ hours: 25 });
    await h.runtime.runTriggers();
    expect(h.messagesTo('secEng')).toContain(
      'Reminder: launch of zhang waits for Security review',
    );
    h.advance({ hours: 48 });
    await h.runtime.runTriggers();
    const security = await approvalStages(h, record, 'security');
    expect(security[0].assignees).toMatchObject([
      { userId: 'secLead', via: 'escalate' },
    ]);
    expect(parent(h, record.id).status).toBe('running');
  });

  it('strategy · partial completion then failure: finance rejects, open reviews are cancelled and the finished preparation is compensated', async () => {
    const h = launch();
    const record = await started(h, 'launch', CONTENT);
    await approveSecurity(h, record.id);
    expect(workChild(h, record, 'ops').status).toBe('done');
    await decideBranch(h, record, 'finance', 'finA', 'reject');
    expect(parent(h, record.id)).toMatchObject({
      status: 'failed',
      outcome: { note: 'Branch "finance" ended rejected.' },
    });
    expect(approvalChild(h, record, 'legal').status).toBe('cancelled');
    // The finished approval keeps its meaning; the preparation is undone, last step first.
    expect(approvalChild(h, record, 'security').status).toBe('approved');
    const ops = workChild(h, record, 'ops');
    expect(ops.status).toBe('rolledBack');
    expect(ops.steps.map((step) => step.status)).toEqual([
      'rolledBack',
      'rolledBack',
    ]);
    expect(h.external.rolledBack).toEqual([
      'configureMonitoring',
      'provisionServers',
    ]);
    expect(await h.history('workItems', ops.id)).toEqual([
      'start',
      'stepDone',
      'stepDone',
      'compensate',
      'rollbackDone',
    ]);
    // The rollback signal arrived after the outcome: recorded, not applied.
    expect(
      parent(h, record.id).lateResults.map((late) => [late.key, late.to]),
    ).toContainEqual(['ops', 'rolledBack']);
  });

  it('strategy · no compensation: a finished preparation stays as it is after the launch fails', async () => {
    const h = launch();
    const strategy: CoordinationStrategy = {
      ...LAUNCH_STRATEGY,
      compensate: false,
    };
    const record = await started(h, 'launch', CONTENT, { strategy });
    await decideBranch(h, record, 'finance', 'finA', 'reject');
    expect(parent(h, record.id).status).toBe('failed');
    expect(workChild(h, record, 'ops').status).toBe('done');
    expect(h.external.rolledBack).toEqual([]);
  });

  it('strategy · a failed preparation fails the launch (onBranchFailure: fail) and cancels the reviews', async () => {
    const h = launch();
    h.external.outages.set('step:provisionServers', 3);
    const record = await started(h, 'launch', CONTENT);
    expect(parent(h, record.id)).toMatchObject({
      status: 'failed',
      outcome: { note: 'Branch "ops" ended failed.' },
    });
    // The failed item is open too, so cancelOpen closes it; nothing had reached the outside to undo.
    expect(workChild(h, record, 'ops')).toMatchObject({
      status: 'cancelled',
      lastError: 'step:provisionServers is unavailable.',
    });
    expect(h.external.rolledBack).toEqual([]);
    expect(approvalChild(h, record, 'security').status).toBe('cancelled');
  });

  it('strategy · a failed preparation waits for operations (onBranchFailure: wait); their retry repeats only the failed step', async () => {
    const h = launch();
    h.external.outages.set('step:configureMonitoring', 3);
    const strategy: CoordinationStrategy = {
      ...LAUNCH_STRATEGY,
      onBranchFailure: 'wait',
    };
    const record = await started(h, 'launch', CONTENT, { strategy });
    expect(parent(h, record.id)).toMatchObject({
      status: 'running',
      attention: ['ops'],
    });
    expect(
      (
        await refusal(
          h.fire('workItems', branch(record, 'ops').id, 'retry', {}, 'zhang'),
        )
      ).code,
    ).toBe('GUARD_REJECTED');
    await h.fire('workItems', branch(record, 'ops').id, 'retry', {}, 'opsA');
    expect(workChild(h, record, 'ops').status).toBe('done');
    expect(
      h.external.calls.filter((call) =>
        call.startsWith('step:provisionServers'),
      ),
    ).toHaveLength(1);
    expect(parent(h, record.id).attention).toEqual([]);
  });

  it('strategy · letOpenFinish with compensation: a preparation that finishes after the launch failed is undone when it reports', async () => {
    const h = launch();
    h.external.outages.set('step:provisionServers', 3);
    const strategy: CoordinationStrategy = {
      ...LAUNCH_STRATEGY,
      onBranchFailure: 'wait',
      onFailure: 'letOpenFinish',
    };
    const record = await started(h, 'launch', CONTENT, { strategy });
    await decideBranch(h, record, 'finance', 'finA', 'reject');
    expect(parent(h, record.id).status).toBe('failed');
    expect(approvalChild(h, record, 'legal').status).toBe('inReview');
    await h.fire('workItems', branch(record, 'ops').id, 'retry', {}, 'opsA');
    expect(workChild(h, record, 'ops').status).toBe('rolledBack');
    expect(parent(h, record.id)).toMatchObject({
      status: 'failed',
      outcome: { note: 'Branch "finance" ended rejected.' },
    });
  });

  it('limitation: retryRun on a step effect whose onFailure already fired cannot move the item — the effect has to check the state itself; use the retry transition', async () => {
    const h = launch();
    h.external.outages.set('step:provisionServers', 3);
    const strategy: CoordinationStrategy = {
      ...LAUNCH_STRATEGY,
      onBranchFailure: 'wait',
    };
    const record = await started(h, 'launch', CONTENT, { strategy });
    const [run] = await h.runtime.listEffectRuns({
      effect: 'workItems.runStep',
      status: 'failed',
    });
    const retried = await h.runtime.retryRun(run.id);
    // runStep sees the item is no longer running and does nothing; without
    // that check the step would run again outside and its onSuccess be refused.
    expect(retried).toMatchObject({
      status: 'succeeded',
      result: { step: null },
    });
    expect(workChild(h, record, 'ops').status).toBe('failed');
    expect(
      h.external.calls.filter((call) =>
        call.startsWith('step:provisionServers'),
      ),
    ).toHaveLength(3);
    await h.fire('workItems', branch(record, 'ops').id, 'retry', {}, 'opsA');
    expect(workChild(h, record, 'ops').status).toBe('done');
    expect(
      h.external.calls.filter((call) =>
        call.startsWith('step:provisionServers'),
      ),
    ).toHaveLength(4);
  });

  it("limitation: every signal restarts the parent's idle clock, so a slow branch beside a fast one is reminded later than its own idle time", async () => {
    const h = launch();
    const record = await started(h, 'launch', CONTENT);
    h.advance({ hours: 20 });
    await decideBranch(h, record, 'finance', 'finA');
    h.advance({ hours: 5 });
    await h.runtime.runTriggers();
    // Security has been idle 25 hours, but the launch only 5.
    expect(
      h
        .messagesTo('secEng')
        .filter((subject) => subject.startsWith('Reminder')),
    ).toEqual([]);
    h.advance({ hours: 20 });
    await h.runtime.runTriggers();
    expect(
      h
        .messagesTo('secEng')
        .filter((subject) => subject.startsWith('Reminder')),
    ).toHaveLength(1);
  });
});
