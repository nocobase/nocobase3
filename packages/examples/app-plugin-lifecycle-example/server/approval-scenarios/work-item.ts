import {
  defineEffect,
  defineLifecycle,
  LifecycleError,
  SYSTEM_ACTOR,
  type EffectDefinition,
  type GuardVerdict,
  type InputProblem,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import { APPROVAL_ADMIN } from './approval/lifecycle.js';
import { SCENARIO_COLLECTIONS, type ScenarioServices } from './services.js';

// A branch that is work rather than a decision (scenarios 10 and 19): an
// operations preparation, an IT onboarding sub-process. Its steps are copied
// onto the record when it is created, so a later change to the step list —
// a new version of the sub-process — reaches only items created afterwards,
// or an item an operator explicitly upgrades.

export type WorkItemState =
  | 'pending'
  | 'running'
  | 'failed'
  | 'done'
  | 'rollingBack'
  | 'rolledBack'
  | 'cancelled';

export type StepStatus =
  'pending' | 'running' | 'done' | 'failed' | 'rolledBack';

export interface StepSpec {
  readonly key: string;
  readonly title: string;
}

export interface WorkStep {
  readonly key: string;
  readonly title: string;
  readonly status: StepStatus;
  readonly at: string | null;
  readonly error: string | null;
}

export interface WorkItem extends LifecycleRecord {
  readonly title: string;
  /** The definition and version the steps were copied from, such as `itOnboarding@v3`. */
  readonly definition: string;
  /** Passed to the external system with each step, so a retried step is done once. */
  readonly businessKey: string;
  /** The role whose holders may retry, upgrade or cancel this item. */
  readonly ownerRole: string;
  readonly steps: readonly WorkStep[];
  readonly cursor: number | null;
  readonly parentLifecycle: string | null;
  readonly parentId: string | null;
  readonly branchKey: string | null;
  readonly lastError: string | null;
  /** Why it is rolling back: a cancellation ends `cancelled`, a compensation `rolledBack`. */
  readonly rollbackFor: 'cancel' | 'compensate' | null;
  readonly notes: readonly string[];
  readonly status: WorkItemState;
  readonly statusChangedAt: string;
}

export interface WorkItemTypes {
  record: WorkItem;
  state: WorkItemState;
  services: ScenarioServices;
}

type Context = TransitionContext<WorkItemTypes>;

const MOVED_ON = ['INVALID_STATE', 'GUARD_REJECTED', 'RECORD_NOT_FOUND'];

/** The values `runtime.create()` — or a parent inserting it — needs besides the lifecycle fields. */
export function workItemValues(values: {
  readonly title: string;
  readonly definition: string;
  readonly steps: readonly StepSpec[];
  readonly ownerRole: string;
  readonly businessKey: string;
  readonly parentLifecycle?: string;
  readonly parentId?: string;
  readonly branchKey?: string;
}): Record<string, unknown> {
  return {
    title: values.title,
    definition: values.definition,
    businessKey: values.businessKey,
    ownerRole: values.ownerRole,
    steps: values.steps.map((step): WorkStep => ({
      key: step.key,
      title: step.title,
      status: 'pending',
      at: null,
      error: null,
    })),
    cursor: null,
    parentLifecycle: values.parentLifecycle ?? null,
    parentId: values.parentId ?? null,
    branchKey: values.branchKey ?? null,
    lastError: null,
    rollbackFor: null,
    notes: [],
  };
}

function systemOnly({ actor }: Context): GuardVerdict {
  return (
    actor.system === true || {
      code: 'systemOnly',
      message: 'The system does this.',
    }
  );
}

/** The item's owning team or an approval administrator. */
function operator({ record, actor, services }: Context): GuardVerdict {
  if (actor.system === true) return true;
  return (
    ((services.org.hasRole(actor.id, record.ownerRole) ||
      services.org.hasRole(actor.id, APPROVAL_ADMIN)) &&
      services.org.isActive(actor.id)) || {
      code: 'operatorOnly',
      message: `Only ${record.ownerRole} or an approval administrator can do this.`,
    }
  );
}

function textOf(input: JsonObject, field: string): string {
  const value = input[field];
  return typeof value === 'string' ? value.trim() : '';
}

function withStep(
  record: WorkItem,
  index: number | null,
  change: Partial<WorkStep>,
): WorkStep[] {
  return record.steps.map((step, at) =>
    at === index ? { ...step, ...change } : step,
  );
}

/** Steps that may have reached the outside: finished ones, and the one in flight. */
function touched(record: WorkItem): WorkStep[] {
  return record.steps.filter(
    (step) => step.status === 'done' || step.status === 'running',
  );
}

function stepSpecs(input: JsonObject): StepSpec[] {
  const steps = Array.isArray(input.steps) ? input.steps : [];
  return steps.flatMap((step) =>
    typeof step === 'object' &&
    step !== null &&
    !Array.isArray(step) &&
    typeof step.key === 'string'
      ? [
          {
            key: step.key,
            title: typeof step.title === 'string' ? step.title : step.key,
          },
        ]
      : [],
  );
}

/** Runs the step at the cursor; its success moves the cursor, its last failure fails the item. */
const runStep: EffectDefinition<WorkItemTypes> = defineEffect<WorkItemTypes>({
  name: 'workItems.runStep',
  retry: { attempts: 3, backoffMs: 1_000, factor: 2 },
  onSuccess: 'stepDone',
  onFailure: 'stepFailed',
  run: async ({ record, services }) => {
    const step =
      record.cursor === null ? undefined : record.steps[record.cursor];
    // Moved on since the run was owed: stepDone's guard refuses a null step.
    if (record.status !== 'running' || step?.status !== 'running')
      return { step: null };
    // Keyed by the item and the step, not by the run: a retry after an
    // operator's `retry` is a new run, and must still not repeat the step.
    await services.external.runOnboardingStep(record.businessKey, step.key);
    return { step: step.key };
  },
});

/** Undoes every step that may have happened, last first. */
const rollBack: EffectDefinition<WorkItemTypes> = defineEffect<WorkItemTypes>({
  name: 'workItems.rollBack',
  retry: { attempts: 3, backoffMs: 1_000 },
  onSuccess: 'rollbackDone',
  run: async ({ record, services }) => {
    const steps = touched(record).reverse();
    for (const step of steps)
      await services.external.rollBackPreparation(record.businessKey, step.key);
    return { rolledBack: steps.map((step) => step.key) };
  },
});

/** The same contract as approvalRequests.notifyParent: fire `branchSettled` on the parent. */
const notifyParent: EffectDefinition<WorkItemTypes> =
  defineEffect<WorkItemTypes>({
    name: 'workItems.notifyParent',
    retry: { attempts: 5, backoffMs: 500 },
    run: async ({ record, to, services, idempotencyKey }) => {
      if (record.parentLifecycle === null || record.parentId === null)
        return { parent: null };
      try {
        await services.lifecycles.fire(
          record.parentLifecycle,
          record.parentId,
          'branchSettled',
          {
            actor: SYSTEM_ACTOR,
            input: { lifecycle: 'workItems', id: String(record.id), state: to },
            // One signal per entered state: the run's key is the same on every attempt.
            requestId: idempotencyKey,
          },
        );
        return { parent: record.parentId };
      } catch (error) {
        if (error instanceof LifecycleError && MOVED_ON.includes(error.code))
          return { parent: record.parentId, ignored: error.code };
        throw error;
      }
    },
  });

/**
 * A sequence of system steps run as effects. Each step is retried; its last
 * failure stops the item in `failed`, where its owner retries it — that step
 * only, the finished ones are not repeated. A done item can be compensated,
 * and a cancelled one undoes what it had done.
 */
export const workItemLifecycle: Lifecycle<WorkItemTypes> =
  defineLifecycle<WorkItemTypes>({
    name: 'workItems',
    collection: SCENARIO_COLLECTIONS.workItems,
    initial: 'pending',
    states: [
      'pending',
      'running',
      'failed',
      'done',
      'rollingBack',
      { name: 'rolledBack', final: true },
      { name: 'cancelled', final: true },
    ],
    transitions: {
      start: {
        title: 'Start',
        from: 'pending',
        to: ['running', 'done'],
        guard: operator,
        route: ({ record }) => (record.steps.length ? 'running' : 'done'),
        set: ({ record }) =>
          record.steps.length
            ? { cursor: 0, steps: withStep(record, 0, { status: 'running' }) }
            : { cursor: null },
      },
      stepDone: {
        title: 'Step done',
        from: 'running',
        to: ['running', 'done'],
        guard: (context) => {
          const { record, input } = context;
          const system = systemOnly(context);
          if (system !== true) return system;
          const step =
            record.cursor === null ? undefined : record.steps[record.cursor];
          // Fences a stale continuation: only the step in progress can finish.
          return (
            step?.key === textOf(input, 'step') || {
              code: 'staleStep',
              message: 'That step is not the one in progress.',
            }
          );
        },
        route: ({ record }) =>
          (record.cursor ?? 0) + 1 < record.steps.length ? 'running' : 'done',
        set: ({ record, now }) => {
          const cursor = record.cursor ?? 0;
          const next = cursor + 1 < record.steps.length ? cursor + 1 : null;
          const steps = withStep(record, cursor, {
            status: 'done',
            at: now.toISOString(),
            error: null,
          }).map((step, index) =>
            index === next ? { ...step, status: 'running' as const } : step,
          );
          return { steps, cursor: next, lastError: null };
        },
      },
      stepFailed: {
        title: 'Step failed',
        from: 'running',
        to: 'failed',
        guard: systemOnly,
        set: ({ record, input, now }) => ({
          steps: withStep(record, record.cursor, {
            status: 'failed',
            at: now.toISOString(),
            error: textOf(input, 'error'),
          }),
          lastError: textOf(input, 'error'),
        }),
      },
      retry: {
        title: 'Retry the failed step',
        from: 'failed',
        to: 'running',
        guard: operator,
        set: ({ record, actor }) => ({
          steps: withStep(record, record.cursor, {
            status: 'running',
            error: null,
          }),
          notes: [
            ...record.notes,
            `${actor.id} retried "${record.steps[record.cursor ?? 0]?.key ?? ''}".`,
          ],
        }),
      },
      upgrade: {
        title: 'Move to another definition version',
        from: ['pending', 'failed'],
        to: ['pending', 'failed'],
        guard: operator,
        validate: (input): InputProblem[] => [
          ...(textOf(input, 'definition')
            ? []
            : [
                {
                  field: 'definition',
                  message: 'Name the definition version.',
                },
              ]),
          ...(stepSpecs(input).length
            ? []
            : [{ field: 'steps', message: 'Give the steps of that version.' }]),
        ],
        route: ({ record }) => record.status,
        set: ({ record, input, actor }) => {
          // Finished steps stay finished; the rest follow the new version.
          const done = record.steps.filter((step) => step.status === 'done');
          const doneKeys = new Set(done.map((step) => step.key));
          const rest = stepSpecs(input)
            .filter((step) => !doneKeys.has(step.key))
            .map((step): WorkStep => ({
              key: step.key,
              title: step.title,
              status: 'pending',
              at: null,
              error: null,
            }));
          const steps = [...done, ...rest];
          const failed = record.status === 'failed' && rest.length > 0;
          return {
            definition: textOf(input, 'definition'),
            steps: failed
              ? steps.map((step, index) =>
                  index === done.length
                    ? {
                        ...step,
                        status: 'failed' as const,
                        error: record.lastError,
                      }
                    : step,
                )
              : steps,
            cursor: failed ? done.length : record.cursor,
            notes: [
              ...record.notes,
              `${actor.id} moved it from ${record.definition} to ${textOf(input, 'definition')}.`,
            ],
          };
        },
      },
      cancel: {
        title: 'Cancel',
        from: ['pending', 'running', 'failed'],
        to: ['cancelled', 'rollingBack'],
        guard: operator,
        route: ({ record }) =>
          touched(record).length ? 'rollingBack' : 'cancelled',
        set: ({ record, actor, input }) => ({
          rollbackFor: 'cancel',
          notes: [
            ...record.notes,
            `Cancelled by ${actor.id}${textOf(input, 'reason') ? `: ${textOf(input, 'reason')}` : ''}.`,
          ],
        }),
      },
      compensate: {
        title: 'Undo the finished work',
        from: 'done',
        to: 'rollingBack',
        guard: operator,
        set: ({ record, actor, input }) => ({
          rollbackFor: 'compensate',
          notes: [
            ...record.notes,
            `Compensation asked by ${actor.id}${textOf(input, 'reason') ? `: ${textOf(input, 'reason')}` : ''}.`,
          ],
        }),
      },
      rollbackDone: {
        title: 'Rolled back',
        from: 'rollingBack',
        to: ['rolledBack', 'cancelled'],
        guard: systemOnly,
        route: ({ record }) =>
          record.rollbackFor === 'cancel' ? 'cancelled' : 'rolledBack',
        set: ({ record, now }) => ({
          steps: record.steps.map((step) =>
            step.status === 'done' || step.status === 'running'
              ? {
                  ...step,
                  status: 'rolledBack' as const,
                  at: now.toISOString(),
                }
              : step,
          ),
          cursor: null,
        }),
      },
    },
    onEnter: {
      // Entered by start, by every stepDone that leaves steps, and by retry.
      running: [runStep],
      rollingBack: [rollBack],
      done: [notifyParent],
      failed: [notifyParent],
      cancelled: [notifyParent],
      rolledBack: [notifyParent],
    },
  });
