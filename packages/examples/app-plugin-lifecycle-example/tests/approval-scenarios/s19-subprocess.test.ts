// Scenario 19: onboarding waits for IT, administration and HR sub-processes,
// each a sequence of system steps that can fail, be retried on its own, be
// cancelled with the whole onboarding, and change version.
import { SYSTEM_ACTOR } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  summarize,
  type CoordinationStrategy,
  type WorkSpec,
} from '../../server/approval-scenarios/coordination.js';
import {
  onboardingPlanner,
  ONBOARDING_STRATEGY,
  type OnboardingDefinitions,
} from '../../server/approval-scenarios/coordination-plans.js';
import {
  workItemValues,
  type WorkItem,
} from '../../server/approval-scenarios/work-item.js';
import {
  branch,
  parent,
  refusal,
  setup,
  started,
  workChild,
} from './coordination-fixtures.js';
import type { Harness } from './harness.js';

const IT_V3: WorkSpec = {
  definition: 'itOnboarding@v3',
  ownerRole: 'itOps',
  steps: [
    { key: 'createAccount', title: 'Create the account' },
    { key: 'createMailbox', title: 'Create the mailbox' },
    { key: 'requestLaptop', title: 'Request a laptop' },
    { key: 'grantPermissions', title: 'Grant permissions' },
  ],
};

const IT_V4: WorkSpec = {
  definition: 'itOnboarding@v4',
  ownerRole: 'itOps',
  steps: [
    { key: 'createAccount', title: 'Create the account' },
    { key: 'createMailbox', title: 'Create the mailbox' },
    { key: 'enrollMfa', title: 'Enroll MFA' },
    { key: 'requestLaptop', title: 'Request a laptop' },
    { key: 'grantPermissions', title: 'Grant permissions' },
  ],
};

const ADMIN_V1: WorkSpec = {
  definition: 'adminOnboarding@v1',
  ownerRole: 'facOps',
  steps: [
    { key: 'assignDesk', title: 'Assign a desk' },
    { key: 'issueBadge', title: 'Issue a badge' },
  ],
};

const HR_V1: WorkSpec = {
  definition: 'hrOnboarding@v1',
  ownerRole: 'hrOps',
  steps: [
    { key: 'openPersonnelFile', title: 'Open the personnel file' },
    { key: 'enrollPayroll', title: 'Enroll in payroll' },
  ],
};

function onboarding(): { h: Harness; definitions: OnboardingDefinitions } {
  const definitions: OnboardingDefinitions = {
    it: IT_V3,
    admin: ADMIN_V1,
    hr: HR_V1,
  };
  return {
    h: setup({ onboarding: onboardingPlanner(definitions) }),
    definitions,
  };
}

/** Offer accepted: the system starts the onboarding of the new hire. */
function hire(
  h: Harness,
  content: Record<string, string | boolean> = {},
  strategy?: CoordinationStrategy,
): ReturnType<typeof started> {
  return started(
    h,
    'onboarding',
    { employee: 'newHire', ...content },
    {
      applicantId: 'newHire',
      actor: { id: 'system', system: true },
      ...(strategy ? { strategy } : {}),
    },
  );
}

function stepStatuses(item: WorkItem): string[] {
  return item.steps.map((step) => `${step.key}:${step.status}`);
}

describe('scenario 19 · nested sub-processes', () => {
  it('onboarding runs the IT, administration and HR sub-processes and completes once all three are done', async () => {
    const { h } = onboarding();
    const record = await hire(h);
    expect(record.branches.map((b) => [b.key, b.kind, b.required])).toEqual([
      ['it', 'subprocess', true],
      ['admin', 'subprocess', true],
      ['hr', 'subprocess', true],
    ]);
    expect(parent(h, record.id)).toMatchObject({
      status: 'completed',
      outcome: { note: 'Every required branch succeeded.' },
    });
    expect(
      h.external.calls.filter((call) => call.endsWith(branch(record, 'it').id)),
    ).toEqual([
      `step:createAccount:${branch(record, 'it').id}`,
      `step:createMailbox:${branch(record, 'it').id}`,
      `step:requestLaptop:${branch(record, 'it').id}`,
      `step:grantPermissions:${branch(record, 'it').id}`,
    ]);
  });

  it('variant · each sub-process is viewable and managed on its own: steps, history, effect runs and what its team may do', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const record = await hire(h);
    expect(parent(h, record.id)).toMatchObject({
      status: 'running',
      attention: ['it'],
    });
    expect(summarize(parent(h, record.id)).work).toEqual({
      it: 'failed',
      admin: 'done',
      hr: 'done',
    });

    const view = await h.runtime.view('workItems', branch(record, 'it').id, {
      id: 'itOpsA',
    });
    expect(view.state).toBe('failed');
    expect(stepStatuses(view.record as WorkItem)).toEqual([
      'createAccount:done',
      'createMailbox:done',
      'requestLaptop:failed',
      'grantPermissions:pending',
    ]);
    expect(view.available.filter((t) => t.allowed).map((t) => t.name)).toEqual([
      'retry',
      'upgrade',
      'cancel',
    ]);
    expect(view.history.transitions.map((entry) => entry.transition)).toEqual([
      'start',
      'stepDone',
      'stepDone',
      'stepFailed',
    ]);
    expect(
      view.history.effectRuns
        .filter((run) => run.effect === 'workItems.runStep')
        .map((run) => run.status),
    ).toEqual(['succeeded', 'succeeded', 'failed']);
    // Another team sees it, but may not act on it.
    expect(
      await h.allowed('workItems', branch(record, 'it').id, 'facOpsA'),
    ).toEqual([]);
  });

  it('variant · retry one sub-process alone: only the failed step runs again; the finished steps and the other sub-processes are untouched', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const record = await hire(h);
    const before = h.external.calls.length;
    await h.fire('workItems', branch(record, 'it').id, 'retry', {}, 'itOpsA');
    expect(h.external.calls.slice(before)).toEqual([
      `step:requestLaptop:${branch(record, 'it').id}`,
      `step:grantPermissions:${branch(record, 'it').id}`,
    ]);
    expect(workChild(h, record, 'it').notes).toEqual([
      'itOpsA retried "requestLaptop".',
    ]);
    expect(parent(h, record.id)).toMatchObject({
      status: 'completed',
      attention: [],
    });
  });

  it('variant · a failed sub-process left alone reminds its team on the reconcile sweep', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:enrollPayroll', 3);
    const record = await hire(h);
    h.advance({ hours: 25 });
    await h.runtime.runTriggers();
    expect(h.messagesTo('hrA')).toEqual([
      'Reminder: onboarding of newHire waits for HR onboarding',
    ]);
    expect(parent(h, record.id).status).toBe('running');
  });

  it('variant · cancelling onboarding cancels the open sub-process, rolls back what it had done, and compensates the finished ones', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const record = await hire(h);
    expect(
      (await refusal(h.fire('coordinations', record.id, 'cancel', {}, 'admin')))
        .message,
    ).toBe('Say why it is cancelled.');
    await h.fire(
      'coordinations',
      record.id,
      'cancel',
      { reason: 'The offer was withdrawn.' },
      'admin',
    );
    expect(parent(h, record.id)).toMatchObject({
      status: 'cancelled',
      outcome: {
        result: 'cancelled',
        by: 'admin',
        note: 'The offer was withdrawn.',
      },
    });
    const it = workChild(h, record, 'it');
    expect(it.status).toBe('cancelled');
    expect(stepStatuses(it)).toEqual([
      'createAccount:rolledBack',
      'createMailbox:rolledBack',
      'requestLaptop:failed',
      'grantPermissions:pending',
    ]);
    expect(workChild(h, record, 'admin').status).toBe('rolledBack');
    expect(workChild(h, record, 'hr').status).toBe('rolledBack');
    expect(h.external.rolledBack).toEqual([
      'createMailbox',
      'createAccount',
      'issueBadge',
      'assignDesk',
      'enrollPayroll',
      'openPersonnelFile',
    ]);
    // A cancelled onboarding is final: the late signals of the rollbacks are refused and ignored.
    expect(parent(h, record.id).lateResults).toEqual([]);
    const runs = await h.runtime.listEffectRuns({
      effect: 'workItems.notifyParent',
    });
    expect(
      runs.filter(
        (run) =>
          (run.result as { ignored?: string } | null)?.ignored ===
          'INVALID_STATE',
      ),
    ).toHaveLength(3);
  });

  it("strategy · no compensation: cancelling still undoes the open sub-process's own steps, finished sub-processes stay done", async () => {
    const { h } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const record = await hire(
      h,
      {},
      { ...ONBOARDING_STRATEGY, compensate: false },
    );
    await h.fire(
      'coordinations',
      record.id,
      'cancel',
      { reason: 'Withdrawn.' },
      'admin',
    );
    expect(workChild(h, record, 'it').status).toBe('cancelled');
    expect(workChild(h, record, 'admin').status).toBe('done');
    expect(h.external.rolledBack).toEqual(['createMailbox', 'createAccount']);
  });

  it('strategy · onBranchFailure fail: an HR failure fails onboarding at once and the finished sub-processes are compensated', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:enrollPayroll', 3);
    const record = await hire(
      h,
      {},
      { ...ONBOARDING_STRATEGY, onBranchFailure: 'fail' },
    );
    expect(parent(h, record.id)).toMatchObject({
      status: 'failed',
      outcome: { note: 'Branch "hr" ended failed.' },
    });
    expect(workChild(h, record, 'it').status).toBe('rolledBack');
    expect(workChild(h, record, 'admin').status).toBe('rolledBack');
    // The failed one is closed too, its finished first step undone.
    expect(stepStatuses(workChild(h, record, 'hr'))).toEqual([
      'openPersonnelFile:rolledBack',
      'enrollPayroll:failed',
    ]);
    expect(workChild(h, record, 'hr').status).toBe('cancelled');
  });

  it('strategy · onBranchFailure fail: when the first sub-process fails while starting, the ones not yet started are cancelled before they run', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:createAccount', 3);
    const record = await hire(
      h,
      {},
      { ...ONBOARDING_STRATEGY, onBranchFailure: 'fail' },
    );
    expect(parent(h, record.id).status).toBe('failed');
    expect(await h.history('workItems', branch(record, 'hr').id)).toEqual([
      'cancel',
    ]);
    expect(
      h.external.calls.some((call) =>
        call.startsWith('step:openPersonnelFile'),
      ),
    ).toBe(false);
  });

  it("strategy · which sub-processes to wait for: a remote hire's administration branch is optional", async () => {
    const { h } = onboarding();
    h.external.outages.set('step:assignDesk', 3);
    const record = await hire(h, { remote: true });
    expect(branch(record, 'admin')).toMatchObject({
      required: false,
      because: 'Remote hire: a desk is not a condition.',
    });
    expect(parent(h, record.id)).toMatchObject({
      status: 'completed',
      attention: ['admin'],
    });
    await h.fire(
      'workItems',
      branch(record, 'admin').id,
      'retry',
      {},
      'facOpsA',
    );
    expect(parent(h, record.id)).toMatchObject({
      status: 'completed',
      attention: [],
      lateResults: [{ key: 'admin', from: 'failed', to: 'done' }],
    });
  });

  it('variant · V3 → V4: an IT sub-process in flight keeps v3; hires after the change get v4; an operator moves a waiting one explicitly', async () => {
    const { h, definitions } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const first = await hire(h);
    definitions.it = IT_V4;
    const second = await started(
      h,
      'onboarding',
      { employee: 'wang' },
      { applicantId: 'wang', actor: { id: 'system', system: true } },
    );
    expect(workChild(h, first, 'it').definition).toBe('itOnboarding@v3');
    expect(workChild(h, first, 'it').steps).toHaveLength(4);
    expect(workChild(h, second, 'it')).toMatchObject({
      definition: 'itOnboarding@v4',
      status: 'done',
    });
    expect(workChild(h, second, 'it').steps.map((step) => step.key)).toContain(
      'enrollMfa',
    );

    const id = branch(first, 'it').id;
    expect(
      (
        await refusal(
          h.fire(
            'workItems',
            id,
            'upgrade',
            { definition: IT_V4.definition, steps: [] },
            'itOpsA',
          ),
        )
      ).code,
    ).toBe('INVALID_INPUT');
    expect(
      (
        await refusal(
          h.fire(
            'workItems',
            id,
            'upgrade',
            {
              definition: IT_V4.definition,
              steps: IT_V4.steps.map((s) => ({ ...s })),
            },
            'hrA',
          ),
        )
      ).code,
    ).toBe('GUARD_REJECTED');
    await h.fire(
      'workItems',
      id,
      'upgrade',
      {
        definition: IT_V4.definition,
        steps: IT_V4.steps.map((s) => ({ ...s })),
      },
      'itOpsA',
    );
    expect(stepStatuses(workChild(h, first, 'it'))).toEqual([
      'createAccount:done',
      'createMailbox:done',
      'enrollMfa:failed',
      'requestLaptop:pending',
      'grantPermissions:pending',
    ]);
    await h.fire('workItems', id, 'retry', {}, 'itOpsA');
    expect(workChild(h, first, 'it')).toMatchObject({
      status: 'done',
      definition: 'itOnboarding@v4',
    });
    expect(parent(h, first.id).status).toBe('completed');
    // The parent's copy of the plan still names v3: the child record is what says which version ran.
    expect(branch(parent(h, first.id), 'it').work?.definition).toBe(
      'itOnboarding@v3',
    );
  });

  it('variant · a sub-process stands on its own: created alone it has its own history and simply has no parent to tell', async () => {
    const { h } = onboarding();
    const item = await h.create(
      'workItems',
      workItemValues({
        title: 'Laptop swap',
        definition: 'itOnboarding@v3',
        steps: IT_V3.steps,
        ownerRole: 'itOps',
        businessKey: 'swap-1',
      }),
      'itOpsA',
    );
    await h.fire('workItems', item.id, 'start', {}, 'itOpsA');
    expect(h.get('workItems', item.id).status).toBe('done');
    expect((await h.history('workItems', item.id))[0]).toBe('$create');
    const [notify] = await h.runtime.listEffectRuns({
      effect: 'workItems.notifyParent',
    });
    expect(notify.result).toEqual({ parent: null });
  });

  it('limitation: a step is invisible to the parent until the sub-process ends a state; nothing is signalled per step', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const record = await hire(h);
    const signals = (
      await h.runtime.history('coordinations', record.id)
    ).transitions.filter(
      (entry) =>
        entry.transition === 'branchSettled' &&
        entry.actorId === SYSTEM_ACTOR.id,
    );
    // Two done (admin, hr) and one failed (it); no step of IT's four was reported.
    expect(signals.map((entry) => String(entry.input.state)).sort()).toEqual([
      'done',
      'done',
      'failed',
    ]);
  });
});
