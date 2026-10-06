import {
  defineEffect,
  defineLifecycle,
  type EffectDefinition,
  type GuardVerdict,
  type InputProblem,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
  type StateHook,
  type TransitionContext,
} from '@nocobase/lifecycle';

import { systemOnly, text, type ScenarioServices } from './services.js';

// A branch that is work rather than a decision (scenarios 10 and 19): an
// operations preparation, an IT onboarding sub-process. Its steps run as
// effects, one after another; a step's last failure stops it in `failed`,
// where its owners retry that step alone. Its steps are copied onto it when
// it is created, so a new version of the sub-process reaches only items
// created afterwards, or one an operator explicitly moves.
//
// It knows nothing of a parent. A coordinator that started it listens with
// a state hook, which runs in the transaction of every transition here — so
// what the parent learns commits with the change it learns about.

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

export interface WorkSpec {
  /** The definition and version, such as `itOnboarding@v3`. */
  readonly definition: string;
  readonly steps: readonly StepSpec[];
  readonly ownerRole: string;
}

export interface WorkStep extends StepSpec {
  readonly status: StepStatus;
  readonly at: string | null;
  readonly error: string | null;
}

export interface WorkItem extends LifecycleRecord {
  readonly title: string;
  readonly definition: string;
  /** Passed to the external system with each step, so a retried step is done once. */
  readonly businessKey: string;
  readonly ownerRole: string;
  readonly steps: readonly WorkStep[];
  readonly cursor: number | null;
  readonly lastError: string | null;
  /** Why it is rolling back: a cancellation ends `cancelled`, a compensation `rolledBack`. */
  readonly rollbackFor: 'cancel' | 'compensate' | null;
  readonly notes: readonly string[];
  readonly status: WorkItemState;
}

export interface WorkItemTypes {
  record: WorkItem;
  state: WorkItemState;
  services: ScenarioServices;
}

type Context = TransitionContext<WorkItemTypes>;

export const WORK_ITEMS = 'scenarioWorkItems';

export function workItemValues(values: {
  readonly title: string;
  readonly work: WorkSpec;
  readonly businessKey: string;
}): Record<string, unknown> {
  return {
    title: values.title,
    definition: values.work.definition,
    businessKey: values.businessKey,
    ownerRole: values.work.ownerRole,
    steps: values.work.steps.map((step): WorkStep => ({
      key: step.key,
      title: step.title,
      status: 'pending',
      at: null,
      error: null,
    })),
    cursor: null,
    lastError: null,
    rollbackFor: null,
    notes: [],
  };
}

function operator({ record, actor, services }: Context): GuardVerdict {
  if (actor.system === true) return true;
  return (
    ((services.org.hasRole(actor.id, record.ownerRole) ||
      services.org.hasRole(actor.id, 'approvalAdmin')) &&
      services.org.isActive(actor.id)) || {
      code: 'operatorOnly',
      message: `Only ${record.ownerRole} or an approval administrator can do this.`,
    }
  );
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

const runStep: EffectDefinition<WorkItemTypes> = defineEffect<WorkItemTypes>({
  name: 'scenarioWorkItems.runStep',
  retry: { attempts: 3, backoffMs: 1_000, factor: 2 },
  onSuccess: 'stepDone',
  onFailure: 'stepFailed',
  run: async ({ record, services }) => {
    const step =
      record.cursor === null ? undefined : record.steps[record.cursor];
    // Moved on since the run was owed: stepDone's guard refuses a null step.
    if (record.status !== 'running' || step?.status !== 'running')
      return { step: null };
    await services.external.runOnboardingStep(record.businessKey, step.key);
    return { step: step.key };
  },
});

const rollBack: EffectDefinition<WorkItemTypes> = defineEffect<WorkItemTypes>({
  name: 'scenarioWorkItems.rollBack',
  retry: { attempts: 3, backoffMs: 1_000 },
  onSuccess: 'rollbackDone',
  run: async ({ record, services }) => {
    const steps = touched(record).reverse();
    for (const step of steps)
      await services.external.rollBackPreparation(record.businessKey, step.key);
    return { rolledBack: steps.map((step) => step.key) };
  },
});

/**
 * A sequence of system steps run as effects. `listen` is a hook run on
 * entering any state: the coordinator's way to learn, in the same
 * transaction, what became of the item.
 */
export function defineWorkItemLifecycle(
  listen?: StateHook<WorkItemTypes>,
): Lifecycle<WorkItemTypes> {
  const states: WorkItemState[] = [
    'pending',
    'running',
    'failed',
    'done',
    'rollingBack',
    'rolledBack',
    'cancelled',
  ];
  return defineLifecycle<WorkItemTypes>({
    name: WORK_ITEMS,
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
        from: 'running',
        to: ['running', 'done'],
        manual: false,
        guard: ({ record, input, actor }) => {
          const system = systemOnly(actor);
          if (system !== true) return system;
          const step =
            record.cursor === null ? undefined : record.steps[record.cursor];
          return (
            step?.key === text(input.step) || {
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
        from: 'running',
        to: 'failed',
        manual: false,
        guard: ({ actor }) => systemOnly(actor),
        set: ({ record, input, now }) => ({
          steps: withStep(record, record.cursor, {
            status: 'failed',
            at: now.toISOString(),
            error: text(input.error),
          }),
          lastError: text(input.error),
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
          ...(text(input.definition)
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
          const done = record.steps.filter((step) => step.status === 'done');
          const doneKeys = new Set(done.map((step) => step.key));
          const rest = stepSpecs(input)
            .filter((step) => !doneKeys.has(step.key))
            .map((step): WorkStep => ({
              ...step,
              status: 'pending',
              at: null,
              error: null,
            }));
          const failed = record.status === 'failed' && rest.length > 0;
          const steps = [...done, ...rest];
          return {
            definition: text(input.definition),
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
              `${actor.id} moved it from ${record.definition} to ${text(input.definition) ?? ''}.`,
            ],
          };
        },
      },
      cancel: {
        from: ['pending', 'running', 'failed'],
        to: ['cancelled', 'rollingBack'],
        guard: operator,
        route: ({ record }) =>
          touched(record).length ? 'rollingBack' : 'cancelled',
        set: ({ record, actor, input }) => ({
          rollbackFor: 'cancel',
          notes: [
            ...record.notes,
            `Cancelled by ${actor.id}${text(input.reason) ? `: ${text(input.reason) ?? ''}` : ''}.`,
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
            `Compensation asked by ${actor.id}${text(input.reason) ? `: ${text(input.reason) ?? ''}` : ''}.`,
          ],
        }),
      },
      rollbackDone: {
        from: 'rollingBack',
        to: ['rolledBack', 'cancelled'],
        manual: false,
        guard: ({ actor }) => systemOnly(actor),
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
    onEnter: { running: [runStep], rollingBack: [rollBack] },
    ...(listen
      ? {
          onEnterState: Object.fromEntries(
            states.map((state) => [state, listen]),
          ),
        }
      : {}),
  });
}
