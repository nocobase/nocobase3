// Scenario 19: onboarding waits for IT, administration and HR
// sub-processes, each a work item of system steps.
import { describe, expect, it } from 'vitest';

import {
  ONBOARDING_STRATEGY,
  onboardingPlanner,
  remindCoordinations,
  type CoordinationStrategy,
  type OnboardingDefinitions,
} from '../../server/scenarios/coordination.js';
import {
  workItemValues,
  type WorkItem,
  type WorkSpec,
} from '../../server/scenarios/work-items.js';
import {
  branch,
  branches,
  COORDINATIONS,
  parent,
  setup,
  started,
  work,
  WORK_ITEMS,
} from '../support/coordination-fixtures.js';
import { refusal, type Harness } from '../support/harness.js';

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

function hire(
  h: Harness,
  content: Record<string, string | boolean> = {},
  strategy?: CoordinationStrategy,
  employee = 'newHire',
): Promise<string> {
  return started(
    h,
    'onboarding',
    { employee, ...content },
    {
      applicantId: employee,
      actor: { id: 'system', system: true },
      ...(strategy ? { strategy } : {}),
    },
  );
}

const steps = (item: WorkItem): string[] =>
  item.steps.map((step) => `${step.key}:${step.status}`);

describe('scenario 19 · nested sub-processes', () => {
  it('onboarding runs the IT, administration and HR sub-processes and completes once all three are done', async () => {
    const { h } = onboarding();
    const id = await hire(h);
    expect(
      (await branches(h, id)).map((row) => [row.key, row.kind, row.required]),
    ).toEqual([
      ['it', 'subprocess', true],
      ['admin', 'subprocess', true],
      ['hr', 'subprocess', true],
    ]);
    expect(parent(h, id)).toMatchObject({
      status: 'completed',
      outcomeNote: 'Every required branch succeeded.',
    });
    const key = (await work(h, id, 'it')).businessKey;
    expect(h.external.calls.filter((call) => call.endsWith(key))).toEqual([
      `step:createAccount:${key}`,
      `step:createMailbox:${key}`,
      `step:requestLaptop:${key}`,
      `step:grantPermissions:${key}`,
    ]);
  });

  it('each sub-process is viewable and managed on its own: steps, history, effect runs and what its team may do', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const id = await hire(h);
    expect(parent(h, id).status).toBe('running');
    expect(
      (await branches(h, id)).map((row) => `${row.key}:${row.state}`),
    ).toEqual(['it:failed', 'admin:done', 'hr:done']);
    const it = await branch(h, id, 'it');
    const view = await h.runtime.view(WORK_ITEMS, it.childId, { id: 'itOpsA' });
    expect(steps(view.record as WorkItem)).toEqual([
      'createAccount:done',
      'createMailbox:done',
      'requestLaptop:failed',
      'grantPermissions:pending',
    ]);
    expect(
      view.available
        .filter((transition) => transition.allowed)
        .map((transition) => transition.name),
    ).toEqual(['retry', 'upgrade', 'cancel']);
    expect(view.history.transitions.map((entry) => entry.transition)).toEqual([
      '$create',
      'start',
      'stepDone',
      'stepDone',
      'stepFailed',
    ]);
    expect(await h.allowed(WORK_ITEMS, it.childId, 'facOpsA')).toEqual([]);
  });

  it('retry one sub-process alone: only the failed step runs again, and its success completes onboarding', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const id = await hire(h);
    const it = await branch(h, id, 'it');
    const before = h.external.calls.length;
    await h.fire(WORK_ITEMS, it.childId, 'retry', {}, 'itOpsA');
    const key = (await work(h, id, 'it')).businessKey;
    expect(h.external.calls.slice(before)).toEqual([
      `step:requestLaptop:${key}`,
      `step:grantPermissions:${key}`,
    ]);
    expect((await work(h, id, 'it')).notes).toEqual([
      'itOpsA retried "requestLaptop".',
    ]);
    expect(parent(h, id).status).toBe('completed');
  });

  it('a failed sub-process left alone reminds its team', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:enrollPayroll', 3);
    const id = await hire(h);
    h.advance({ hours: 25 });
    await remindCoordinations(h.runtime, {
      org: h.org,
      outbox: {
        send: (to: string, subject: string, key: string) =>
          void h.sent.push({ to, subject, key }),
      },
    } as never);
    expect(h.messagesTo('hrA')).toEqual([
      'Reminder: onboarding of newHire waits for HR onboarding',
    ]);
    expect(parent(h, id).status).toBe('running');
  });

  it('cancelling onboarding cancels the open sub-process, rolls back what it had done, and compensates the finished ones', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const id = await hire(h);
    expect(
      (await refusal(h.fire(COORDINATIONS, id, 'cancel', {}, 'admin'))).message,
    ).toBe('Say why it is cancelled.');
    await h.fire(
      COORDINATIONS,
      id,
      'cancel',
      { reason: 'The offer was withdrawn.' },
      'admin',
    );
    expect(parent(h, id)).toMatchObject({
      status: 'cancelled',
      outcomeBy: 'admin',
      outcomeNote: 'The offer was withdrawn.',
    });
    const it = await work(h, id, 'it');
    expect(it.status).toBe('cancelled');
    expect(steps(it)).toEqual([
      'createAccount:rolledBack',
      'createMailbox:rolledBack',
      'requestLaptop:failed',
      'grantPermissions:pending',
    ]);
    expect((await work(h, id, 'admin')).status).toBe('rolledBack');
    expect((await work(h, id, 'hr')).status).toBe('rolledBack');
    expect(h.external.rolledBack).toEqual([
      'createMailbox',
      'createAccount',
      'issueBadge',
      'assignDesk',
      'enrollPayroll',
      'openPersonnelFile',
    ]);
    // A cancelled onboarding keeps no late results: its branches ended with it.
    expect((await branches(h, id)).flatMap((row) => row.late)).toEqual([]);
  });

  it("no compensation: cancelling still undoes the open sub-process's own steps, finished sub-processes stay done", async () => {
    const { h } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const id = await hire(h, {}, { ...ONBOARDING_STRATEGY, compensate: false });
    await h.fire(
      COORDINATIONS,
      id,
      'cancel',
      { reason: 'Withdrawn.' },
      'admin',
    );
    expect((await work(h, id, 'it')).status).toBe('cancelled');
    expect((await work(h, id, 'admin')).status).toBe('done');
    expect(h.external.rolledBack).toEqual(['createMailbox', 'createAccount']);
  });

  it('onBranchFailure fail: an HR failure fails onboarding in the failure’s transaction, and the finished sub-processes are compensated', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:enrollPayroll', 3);
    const id = await hire(
      h,
      {},
      { ...ONBOARDING_STRATEGY, onBranchFailure: 'fail' },
    );
    expect(parent(h, id)).toMatchObject({
      status: 'failed',
      outcomeNote: 'Branch "hr" ended failed.',
    });
    expect((await work(h, id, 'it')).status).toBe('rolledBack');
    expect((await work(h, id, 'admin')).status).toBe('rolledBack');
    expect(steps(await work(h, id, 'hr'))).toEqual([
      'openPersonnelFile:rolledBack',
      'enrollPayroll:failed',
    ]);
    expect((await work(h, id, 'hr')).status).toBe('cancelled');
  });

  it('onBranchFailure fail: a sub-process failing first cancels the others before their steps run', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:createAccount', 3);
    const id = await hire(
      h,
      {},
      { ...ONBOARDING_STRATEGY, onBranchFailure: 'fail' },
    );
    expect(parent(h, id).status).toBe('failed');
    const hr = await branch(h, id, 'hr');
    expect((await h.history(WORK_ITEMS, hr.childId)).slice(0, 3)).toEqual([
      '$create',
      'start',
      'cancel',
    ]);
    expect(
      h.external.calls.some((call) =>
        call.startsWith('step:openPersonnelFile'),
      ),
    ).toBe(false);
  });

  it("which sub-processes to wait for: a remote hire's administration branch is optional", async () => {
    const { h } = onboarding();
    h.external.outages.set('step:assignDesk', 3);
    const id = await hire(h, { remote: true });
    expect(await branch(h, id, 'admin')).toMatchObject({
      required: false,
      because: 'Remote hire: a desk is not a condition.',
    });
    expect(parent(h, id).status).toBe('completed');
    await h.fire(
      WORK_ITEMS,
      (await branch(h, id, 'admin')).childId,
      'retry',
      {},
      'facOpsA',
    );
    expect(parent(h, id).status).toBe('completed');
    expect((await branch(h, id, 'admin')).late).toMatchObject([
      { from: 'running', to: 'done' },
    ]);
  });

  it('V3 → V4: an IT sub-process in flight keeps v3; hires after the change get v4; an operator moves a waiting one explicitly', async () => {
    const { h, definitions } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const first = await hire(h);
    definitions.it = IT_V4;
    const second = await hire(h, {}, undefined, 'wang');
    expect((await work(h, first, 'it')).definition).toBe('itOnboarding@v3');
    expect(await work(h, second, 'it')).toMatchObject({
      definition: 'itOnboarding@v4',
      status: 'done',
    });
    const id = (await branch(h, first, 'it')).childId;
    expect(
      (
        await refusal(
          h.fire(
            WORK_ITEMS,
            id,
            'upgrade',
            { definition: IT_V4.definition, steps: [] },
            'itOpsA',
          ),
        )
      ).code,
    ).toBe('INVALID_INPUT');
    const upgrade = {
      definition: IT_V4.definition,
      steps: IT_V4.steps.map((step) => ({ ...step })),
    };
    expect(
      (await refusal(h.fire(WORK_ITEMS, id, 'upgrade', upgrade, 'hrA'))).code,
    ).toBe('GUARD_REJECTED');
    await h.fire(WORK_ITEMS, id, 'upgrade', upgrade, 'itOpsA');
    expect(steps(await work(h, first, 'it'))).toEqual([
      'createAccount:done',
      'createMailbox:done',
      'enrollMfa:failed',
      'requestLaptop:pending',
      'grantPermissions:pending',
    ]);
    await h.fire(WORK_ITEMS, id, 'retry', {}, 'itOpsA');
    expect(await work(h, first, 'it')).toMatchObject({
      status: 'done',
      definition: 'itOnboarding@v4',
    });
    expect(parent(h, first).status).toBe('completed');
  });

  it('a sub-process stands on its own: created alone it has its own history and no branch row to tell', async () => {
    const { h } = onboarding();
    const item = await h.create(
      WORK_ITEMS,
      workItemValues({
        title: 'Laptop swap',
        work: IT_V3,
        businessKey: 'swap-1',
      }),
      'itOpsA',
    );
    await h.fire(WORK_ITEMS, item.id, 'start', {}, 'itOpsA');
    expect(h.get(WORK_ITEMS, item.id).status).toBe('done');
    expect((await h.history(WORK_ITEMS, item.id))[0]).toBe('$create');
  });

  it('a step is visible to the coordination as it happens, on the branch row, without moving the onboarding', async () => {
    const { h } = onboarding();
    h.external.outages.set('step:requestLaptop', 3);
    const id = await hire(h);
    expect(await h.history(COORDINATIONS, id)).toEqual(['$create', 'start']);
    expect((await branch(h, id, 'it')).state).toBe('failed');
  });
});
