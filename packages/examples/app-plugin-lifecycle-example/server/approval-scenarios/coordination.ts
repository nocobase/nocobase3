import { createHash } from 'node:crypto';

import {
  defineEffect,
  defineLifecycle,
  LifecycleError,
  SYSTEM_ACTOR,
  type EffectDefinition,
  type GuardVerdict,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
  type TransitionHookContext,
} from '@nocobase/lifecycle';

import {
  APPROVAL_ADMIN,
  draftValues,
  type ApprovalRequest,
} from './approval/lifecycle.js';
import { APPROVAL_TABLES } from '../../shared/approval-trail.js';
import { stableJson } from './approval/model.js';
import { approvalRows } from './approval/records.js';
import { SCENARIO_COLLECTIONS, type ScenarioServices } from './services.js';
import { workItemValues, type StepSpec } from './work-item.js';

// Scenarios 9, 10 and 19: one request waits for a set of branches decided by
// its content. The library has no parallel regions, so each branch is a
// child record with a lifecycle of its own — an approval request with its
// own stages, or a work item with its own steps — and this record keeps the
// list, the strategy that turns the branches' results into one outcome, and
// the outcome. Children tell it when they settle (`branchSettled`); it then
// re-reads every child rather than trusting the signal, so a lost, repeated
// or out-of-order signal cannot leave it wrong.

export type CoordinationState =
  'draft' | 'running' | 'completed' | 'failed' | 'cancelled';

export type BranchKind = 'approval' | 'preparation' | 'subprocess';
export type BranchLifecycle = 'approvalRequests' | 'workItems';

export interface WorkSpec {
  /** The definition and version, such as `itOnboarding@v3`. */
  readonly definition: string;
  readonly steps: readonly StepSpec[];
  readonly ownerRole: string;
}

/** One branch a planner asks for. An approval names a policy kind; work names its steps. */
export interface BranchSpec {
  readonly key: string;
  readonly title: string;
  readonly kind: BranchKind;
  readonly required: boolean;
  readonly approvalKind?: string;
  /** What an approval branch reviews. */
  readonly content?: JsonObject;
  readonly work?: WorkSpec;
  /** Why the branch is in the plan, kept for the history. */
  readonly because?: string;
}

/** A branch as the record keeps it: the child's id and the child's state as last read. */
export interface Branch {
  readonly key: string;
  readonly title: string;
  readonly kind: BranchKind;
  readonly required: boolean;
  readonly lifecycle: BranchLifecycle;
  readonly id: string;
  readonly state: string | null;
  /** Hash of what the branch covers; a revision keeps a branch whose basis did not change. */
  readonly basis: string;
  readonly approvalKind: string | null;
  readonly content: JsonObject;
  readonly work: WorkSpec | null;
  readonly because: string | null;
  /** The revision of the request the branch was created for. */
  readonly revision: number;
}

export type CompletionRule =
  | { readonly kind: 'all' }
  | { readonly kind: 'atLeast'; readonly count: number };

/** The business choices scenarios 9, 10 and 19 leave open, fixed per request when it starts. */
export interface CoordinationStrategy {
  /** Over the required branches: every one must succeed, or at least `count`. */
  readonly rule: CompletionRule;
  /** A failed work item: wait for its owner to retry it, or fail the whole request. */
  readonly onBranchFailure: 'wait' | 'fail';
  /**
   * Once the request has failed: cancel the open branches, or let them
   * finish. Results that arrive later are recorded and never change the outcome.
   */
  readonly onFailure: 'cancelOpen' | 'letOpenFinish';
  /** Undo finished work once the request failed, was cancelled, or no longer needs it. */
  readonly compensate: boolean;
}

export interface CoordinationPlan {
  readonly branches: readonly BranchSpec[];
  /** Reasons the content cannot be planned, such as a category no department reviews. */
  readonly problems: readonly string[];
  readonly notes: readonly string[];
}

/** The business rule of one kind of coordinated request: which branches its content needs. */
export interface CoordinationPlanner {
  readonly title: string;
  readonly strategy: CoordinationStrategy;
  plan(content: JsonObject, applicantId: string): CoordinationPlan;
}

/** A branch result that arrived after the outcome: kept, never applied. */
export interface LateResult {
  readonly key: string;
  readonly id: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly at: string;
}

export interface CoordinationOutcome {
  readonly result: 'completed' | 'failed' | 'cancelled';
  readonly at: string;
  readonly by: string;
  readonly note: string;
}

export interface Coordination extends LifecycleRecord {
  readonly kind: string;
  readonly title: string;
  readonly applicantId: string;
  readonly content: JsonObject;
  readonly revision: number;
  readonly strategy: CoordinationStrategy | null;
  readonly branches: readonly Branch[];
  /** Branches a revision replaced, kept with their children for the history. */
  readonly superseded: readonly Branch[];
  readonly notes: readonly string[];
  /** Branches waiting for a person: a failed work item under `onBranchFailure: 'wait'`. */
  readonly attention: readonly string[];
  readonly lateResults: readonly LateResult[];
  readonly outcome: CoordinationOutcome | null;
  readonly status: CoordinationState;
  readonly statusChangedAt: string;
}

export interface CoordinationTypes {
  record: Coordination;
  state: CoordinationState;
  parameters: { reconcileAfterHours: number };
  services: ScenarioServices;
}

type Context = TransitionContext<CoordinationTypes>;

export const COORDINATIONS = 'coordinations' as const;

export const BRANCH_COLLECTIONS: Readonly<Record<BranchLifecycle, string>> =
  Object.freeze({
    approvalRequests: SCENARIO_COLLECTIONS.approvalRequests,
    workItems: SCENARIO_COLLECTIONS.workItems,
  });

const MOVED_ON = ['INVALID_STATE', 'GUARD_REJECTED', 'RECORD_NOT_FOUND'];

function movedOn(error: unknown): boolean {
  return error instanceof LifecycleError && MOVED_ON.includes(error.code);
}

export function coordinationValues(values: {
  readonly kind: string;
  readonly title: string;
  readonly applicantId: string;
  readonly content: JsonObject;
  /** Overrides the planner's strategy for this request. */
  readonly strategy?: CoordinationStrategy;
}): Record<string, unknown> {
  return {
    kind: values.kind,
    title: values.title,
    applicantId: values.applicantId,
    content: values.content,
    revision: 0,
    strategy: values.strategy ?? null,
    branches: [],
    superseded: [],
    notes: [],
    attention: [],
    lateResults: [],
    outcome: null,
  };
}

export type BranchResult = 'succeeded' | 'failed' | 'open';

/** What a branch's last known state means for the whole. */
export function branchResult(
  branch: Branch,
  strategy: CoordinationStrategy,
): BranchResult {
  const { state } = branch;
  if (branch.lifecycle === 'approvalRequests') {
    if (state === 'approved') return 'succeeded';
    return state === 'rejected' || state === 'cancelled' ? 'failed' : 'open';
  }
  if (state === 'done') return 'succeeded';
  if (
    state === 'cancelled' ||
    state === 'rolledBack' ||
    state === 'rollingBack'
  )
    return 'failed';
  return state === 'failed' && strategy.onBranchFailure === 'fail'
    ? 'failed'
    : 'open';
}

export interface Evaluation {
  readonly result: 'running' | 'completed' | 'failed';
  readonly note: string;
}

/** The whole's result from the required branches; optional ones never decide it. */
export function evaluate(
  branches: readonly Branch[],
  strategy: CoordinationStrategy,
): Evaluation {
  const required = branches.filter((branch) => branch.required);
  const results = required.map((branch) => ({
    branch,
    result: branchResult(branch, strategy),
  }));
  const failed = results.filter(({ result }) => result === 'failed');
  const succeeded = results.filter(
    ({ result }) => result === 'succeeded',
  ).length;
  const open = results.filter(({ result }) => result === 'open').length;
  const rule = strategy.rule;
  if (rule.kind === 'all') {
    if (failed.length)
      return {
        result: 'failed',
        note: failed
          .map(
            ({ branch }) =>
              `Branch "${branch.key}" ended ${branch.state ?? 'unknown'}.`,
          )
          .join(' '),
      };
    if (open === 0)
      return {
        result: 'completed',
        note: required.length
          ? 'Every required branch succeeded.'
          : 'No branch is required.',
      };
    return { result: 'running', note: `${open} required branch(es) open.` };
  }
  if (succeeded >= rule.count)
    return {
      result: 'completed',
      note: `${succeeded} of the required ${rule.count} branches succeeded.`,
    };
  if (succeeded + open < rule.count)
    return {
      result: 'failed',
      note: `At most ${succeeded + open} branches can succeed; ${rule.count} are required.`,
    };
  return {
    result: 'running',
    note: `${succeeded} of ${rule.count} branches succeeded so far.`,
  };
}

export interface CoordinationSummary {
  /** Opinions: approval branches by key and state. */
  readonly approvals: Readonly<Record<string, string | null>>;
  /** Work: preparations and sub-processes by key and state. */
  readonly work: Readonly<Record<string, string | null>>;
  readonly open: readonly string[];
  readonly attention: readonly string[];
}

/** Opinions and work results apart: a finished preparation is not an approval. */
export function summarize(record: Coordination): CoordinationSummary {
  const strategy = record.strategy;
  const approvals: Record<string, string | null> = {};
  const work: Record<string, string | null> = {};
  for (const branch of record.branches)
    (branch.lifecycle === 'approvalRequests' ? approvals : work)[branch.key] =
      branch.state;
  return {
    approvals,
    work,
    open: strategy
      ? record.branches
          .filter((branch) => branchResult(branch, strategy) === 'open')
          .map((branch) => branch.key)
      : [],
    attention: record.attention,
  };
}

function basisOf(spec: BranchSpec): string {
  return createHash('sha256')
    .update(
      stableJson({
        approvalKind: spec.approvalKind ?? null,
        content: spec.content ?? {},
        work: spec.work ?? null,
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

/**
 * The child's id is chosen here rather than by the store, so the branch list
 * written with the parent already names the rows `onTransition` inserts.
 */
function branchOf(
  spec: BranchSpec,
  parentId: string,
  revision: number,
): Branch {
  const lifecycle: BranchLifecycle =
    spec.kind === 'approval' ? 'approvalRequests' : 'workItems';
  return {
    key: spec.key,
    title: spec.title,
    kind: spec.kind,
    required: spec.required,
    lifecycle,
    id: `${parentId}-${spec.key}-r${revision}`,
    state: lifecycle === 'approvalRequests' ? 'draft' : 'pending',
    basis: basisOf(spec),
    approvalKind: spec.approvalKind ?? null,
    content: spec.content ?? {},
    work: spec.work ?? null,
    because: spec.because ?? null,
    revision,
  };
}

function specProblems(plan: CoordinationPlan): string[] {
  const problems = [...plan.problems];
  const keys = new Set<string>();
  for (const spec of plan.branches) {
    if (keys.has(spec.key))
      problems.push(`Branch "${spec.key}" appears twice.`);
    keys.add(spec.key);
    if (spec.kind === 'approval' && !spec.approvalKind)
      problems.push(`Branch "${spec.key}" names no approval policy.`);
    if (spec.kind !== 'approval' && !spec.work)
      problems.push(`Branch "${spec.key}" names no work.`);
  }
  return problems;
}

function textOf(input: JsonObject, field: string): string {
  const value = input[field];
  return typeof value === 'string' ? value.trim() : '';
}

function outcome(
  result: CoordinationOutcome['result'],
  context: Context,
  note: string,
): CoordinationOutcome {
  return { result, at: context.now.toISOString(), by: context.actor.id, note };
}

function systemOnly({ actor }: Context): GuardVerdict {
  return (
    actor.system === true || {
      code: 'systemOnly',
      message: 'The system does this.',
    }
  );
}

function isOpenChild(lifecycle: BranchLifecycle, state: string): boolean {
  return lifecycle === 'approvalRequests'
    ? ['draft', 'inReview', 'awaitingMaterials'].includes(state)
    : ['pending', 'running', 'failed'].includes(state);
}

/** Inserts the children of branches the transition added, in its transaction. */
async function insertChildren(
  context: TransitionHookContext<CoordinationTypes>,
): Promise<void> {
  const { record, previous, services, now } = context;
  const existing = new Set(previous.branches.map((branch) => branch.id));
  for (const branch of record.branches) {
    if (existing.has(branch.id)) continue;
    const title = `${record.title} · ${branch.title}`;
    const values =
      branch.lifecycle === 'approvalRequests'
        ? draftValues({
            kind: branch.approvalKind ?? '',
            title,
            applicantId: record.applicantId,
            content: branch.content,
            parentLifecycle: COORDINATIONS,
            parentId: String(record.id),
          })
        : workItemValues({
            title,
            definition: branch.work?.definition ?? '',
            steps: branch.work?.steps ?? [],
            ownerRole: branch.work?.ownerRole ?? APPROVAL_ADMIN,
            businessKey: branch.id,
            parentLifecycle: COORDINATIONS,
            parentId: String(record.id),
            branchKey: branch.key,
          });
    // `runtime.create()` cannot join this transaction, so the lifecycle's
    // own fields are written here; the child gets no `$create` entry and is
    // started by syncBranches once this commits.
    await services.records.insert(BRANCH_COLLECTIONS[branch.lifecycle], {
      ...values,
      id: branch.id,
      status: branch.state,
      statusChangedAt: now.toISOString(),
      lifecycleVersion: 0,
    });
  }
}

interface BranchAction {
  readonly transition: string;
  readonly input: JsonObject;
}

/** What a child should be told, given where the whole is: start, cancel, undo, or nothing. */
function actionFor(
  parent: Coordination,
  branch: Branch,
  superseded: boolean,
  child: LifecycleRecord,
): BranchAction | null {
  const strategy = parent.strategy;
  if (!strategy) return null;
  const state = String(child.status);
  const open = isOpenChild(branch.lifecycle, state);
  const winding =
    superseded ||
    parent.status === 'cancelled' ||
    (parent.status === 'failed' && strategy.onFailure === 'cancelOpen');
  if (winding && open)
    return {
      transition: 'cancel',
      input: {
        reason: superseded
          ? `Superseded by revision ${parent.revision}.`
          : `The request is ${parent.status}.`,
      },
    };
  // A child returned to its applicant is in draft again with a later round;
  // only a child never submitted is started here.
  const fresh =
    branch.lifecycle === 'approvalRequests'
      ? state === 'draft' && Number(child.round) === 0
      : state === 'pending';
  if (parent.status === 'running' && !superseded && fresh)
    return {
      transition: branch.lifecycle === 'approvalRequests' ? 'submit' : 'start',
      input: {},
    };
  const undo =
    strategy.compensate &&
    (superseded || parent.status === 'cancelled' || parent.status === 'failed');
  if (undo && branch.lifecycle === 'workItems' && state === 'done')
    return {
      transition: 'compensate',
      input: { reason: `The request is ${parent.status}.` },
    };
  return null;
}

/**
 * Brings every child in line with the whole. Each action is keyed per child,
 * and a child that moved on is passed over, so running it again — a retry,
 * the next transition's run — changes nothing already done.
 */
const syncBranches: EffectDefinition<CoordinationTypes> =
  defineEffect<CoordinationTypes>({
    name: 'coordinations.syncBranches',
    retry: { attempts: 5, backoffMs: 1_000, factor: 2 },
    run: async ({ record, services }) => {
      const read = async (): Promise<Coordination> =>
        ((await services.records.get(
          SCENARIO_COLLECTIONS.coordinations,
          record.id,
        )) as Coordination | undefined) ?? record;
      const first = await read();
      const branches: [Branch, boolean][] = [
        ...first.branches.map((branch): [Branch, boolean] => [branch, false]),
        ...first.superseded.map((branch): [Branch, boolean] => [branch, true]),
      ];
      const actions: string[] = [];
      for (const [branch, superseded] of branches) {
        // Re-read each time: a child settling below may have settled the whole.
        const parent = await read();
        const child = await services.records.get(
          BRANCH_COLLECTIONS[branch.lifecycle],
          branch.id,
        );
        if (!child) continue;
        const action = actionFor(parent, branch, superseded, child);
        if (!action) continue;
        try {
          await services.lifecycles.fire(
            branch.lifecycle,
            branch.id,
            action.transition,
            {
              actor: SYSTEM_ACTOR,
              input: action.input,
              requestId: `${COORDINATIONS}:${String(record.id)}:${action.transition}:${branch.id}`,
            },
          );
          actions.push(`${action.transition}:${branch.key}`);
        } catch (error) {
          if (!movedOn(error)) throw error;
        }
      }
      return { actions };
    },
  });

/** The second half of a signal: once the recorded branch states decide the whole, settle it. */
const concludeIfDecided: EffectDefinition<CoordinationTypes> =
  defineEffect<CoordinationTypes>({
    name: 'coordinations.concludeIfDecided',
    retry: { attempts: 5, backoffMs: 500 },
    run: async ({ record, services }) => {
      if (record.status !== 'running' || !record.strategy)
        return { concluded: null };
      if (evaluate(record.branches, record.strategy).result === 'running')
        return { concluded: null };
      try {
        await services.lifecycles.fire(COORDINATIONS, record.id, 'conclude', {
          actor: SYSTEM_ACTOR,
        });
        return { concluded: true };
      } catch (error) {
        if (!movedOn(error)) throw error;
        return { concluded: null, ignored: (error as LifecycleError).code };
      }
    },
  });

/** On a sweep (a signal without input), reminds whoever an open branch waits for. */
const nudgeOpenBranches: EffectDefinition<CoordinationTypes> =
  defineEffect<CoordinationTypes>({
    name: 'coordinations.nudgeOpenBranches',
    retry: { attempts: 3, backoffMs: 1_000 },
    run: async ({ record, input, services, idempotencyKey }) => {
      if (record.status !== 'running' || Object.keys(input).length > 0)
        return { nudged: [] };
      const nudged: string[] = [];
      for (const branch of record.branches) {
        const child = await services.records.get(
          BRANCH_COLLECTIONS[branch.lifecycle],
          branch.id,
        );
        if (!child) continue;
        let people: string[] = [];
        if (
          branch.lifecycle === 'approvalRequests' &&
          child.status === 'inReview'
        ) {
          const request = child as ApprovalRequest;
          if (request.currentStageId !== null)
            people = (
              await services.records.find(APPROVAL_TABLES.tasks, {
                stageId: request.currentStageId,
              })
            )
              .map(approvalRows.task)
              .filter(
                (task) =>
                  task.kind === 'decide' &&
                  (task.status === 'pending' || task.status === 'claimed'),
              )
              .map((task) => task.assigneeId);
        } else if (
          branch.lifecycle === 'workItems' &&
          child.status === 'failed' &&
          branch.work
        )
          people = services.org
            .holders(branch.work.ownerRole)
            .filter((person) => services.org.isActive(person));
        for (const person of people) {
          await services.outbox.send(
            person,
            `Reminder: ${record.title} waits for ${branch.title}`,
            `${idempotencyKey}:${branch.key}:${person}`,
          );
          nudged.push(`${branch.key}:${person}`);
        }
      }
      return { nudged };
    },
  });

const notifyOutcome: EffectDefinition<CoordinationTypes> =
  defineEffect<CoordinationTypes>({
    name: 'coordinations.notifyOutcome',
    retry: { attempts: 3, backoffMs: 1_000 },
    run: async ({ record, from, to, services }) => {
      // onEnter also runs on a self-transition that records a late result.
      if (from === to) return { sent: false };
      await services.outbox.send(
        record.applicantId,
        `${record.title}: ${to}`,
        `${COORDINATIONS}:${String(record.id)}:${to}`,
      );
      return { sent: true };
    },
  });

/**
 * The coordinated request. `planners` are the business rules by request
 * kind; they are code, like the lifecycle, and the plan they produce is
 * copied onto the record when it starts.
 */
export function defineCoordinationLifecycle(
  planners: Readonly<Record<string, CoordinationPlanner>>,
): Lifecycle<CoordinationTypes> {
  const plannerOf = (kind: string): CoordinationPlanner | undefined =>
    planners[kind];

  const planStart = (
    context: Context,
  ): { to: CoordinationState; values: Record<string, unknown> } => {
    const { record } = context;
    const planner = plannerOf(record.kind);
    if (!planner)
      throw new LifecycleError(
        'GUARD_REJECTED',
        `No planner for "${record.kind}".`,
      );
    const strategy = record.strategy ?? planner.strategy;
    const plan = planner.plan(record.content, record.applicantId);
    const branches = plan.branches.map((spec) =>
      branchOf(spec, String(record.id), 1),
    );
    const evaluation = evaluate(branches, strategy);
    const done = evaluation.result === 'completed';
    const note = branches.length
      ? evaluation.note
      : `No branch is needed. ${plan.notes.join(' ')}`.trim();
    return {
      to: done ? 'completed' : 'running',
      values: {
        revision: 1,
        strategy,
        branches,
        notes: [
          ...plan.notes,
          ...branches.map(
            (branch) => `${branch.key}: ${branch.because ?? 'planned'}`,
          ),
        ],
        outcome: done ? outcome('completed', context, note) : null,
      },
    };
  };

  const planRevision = (
    context: Context,
  ): { to: CoordinationState; values: Record<string, unknown> } => {
    const { record, input } = context;
    const planner = plannerOf(record.kind);
    const strategy = record.strategy;
    if (!planner || !strategy)
      throw new LifecycleError(
        'GUARD_REJECTED',
        'This request cannot be revised.',
      );
    const content = { ...record.content, ...(input.content as JsonObject) };
    const revision = record.revision + 1;
    const plan = planner.plan(content, record.applicantId);
    const kept: string[] = [];
    const added: string[] = [];
    const branches = plan.branches.map((spec) => {
      const existing = record.branches.find(
        (branch) => branch.key === spec.key,
      );
      // A branch whose covered content did not change keeps its child and
      // whatever it has decided; anything else is decided again.
      if (
        existing &&
        existing.basis === basisOf(spec) &&
        branchResult(existing, strategy) !== 'failed'
      ) {
        kept.push(spec.key);
        return { ...existing, required: spec.required };
      }
      added.push(spec.key);
      return branchOf(spec, String(record.id), revision);
    });
    const ids = new Set(branches.map((branch) => branch.id));
    const superseded = record.branches.filter((branch) => !ids.has(branch.id));
    const evaluation = evaluate(branches, strategy);
    const done = evaluation.result === 'completed';
    return {
      to: done ? 'completed' : 'running',
      values: {
        content,
        revision,
        branches,
        superseded: [...record.superseded, ...superseded],
        notes: [
          ...record.notes,
          `Revision ${revision} by ${context.actor.id}: kept [${kept.join(', ')}], new [${added.join(', ')}], superseded [${superseded.map((branch) => branch.key).join(', ')}].`,
        ],
        ...(done
          ? { outcome: outcome('completed', context, evaluation.note) }
          : {}),
      },
    };
  };

  const plannable = (context: Context, content: JsonObject): GuardVerdict => {
    const planner = plannerOf(context.record.kind);
    if (!planner)
      return {
        code: 'unknownKind',
        message: `No planner for "${context.record.kind}".`,
      };
    const problems = specProblems(
      planner.plan(content, context.record.applicantId),
    );
    return problems.length
      ? { code: 'unplannable', message: problems.join(' ') }
      : true;
  };

  return defineLifecycle<CoordinationTypes>({
    name: COORDINATIONS,
    collection: SCENARIO_COLLECTIONS.coordinations,
    initial: 'draft',
    states: [
      'draft',
      'running',
      // Not final: a branch that settles afterwards is recorded on the request
      // and a finished preparation of a failed request is still undone.
      'completed',
      'failed',
      { name: 'cancelled', final: true },
    ],
    parameters: { reconcileAfterHours: 24 },
    transitions: {
      start: {
        title: 'Start',
        from: 'draft',
        to: ['running', 'completed'],
        guard: (context) => {
          const { record, actor } = context;
          if (actor.system !== true && actor.id !== record.applicantId)
            return {
              code: 'applicantOnly',
              message: 'Only the applicant starts it.',
            };
          return plannable(context, record.content);
        },
        route: (context) => planStart(context).to,
        set: (context) => planStart(context).values,
        onTransition: insertChildren,
      },
      branchSettled: {
        title: 'Branch settled',
        from: ['running', 'completed', 'failed'],
        to: ['running', 'completed', 'failed'],
        guard: (context) => {
          const system = systemOnly(context);
          if (system !== true) return system;
          const { record, input } = context;
          const id = textOf(input, 'id');
          return (
            id === '' ||
            [...record.branches, ...record.superseded].some(
              (branch) => branch.id === id,
            ) || {
              code: 'unknownBranch',
              message: `${id} is not a branch of this request.`,
            }
          );
        },
        // `route` cannot await, and the children can only be read with an
        // await: this transition records what the children are, and
        // `conclude` decides from that record.
        route: ({ record }) => record.status,
        set: async ({ record, services, now }) => {
          const reread = (branches: readonly Branch[]): Promise<Branch[]> =>
            Promise.all(
              branches.map(async (branch) => {
                const child = await services.records.get(
                  BRANCH_COLLECTIONS[branch.lifecycle],
                  branch.id,
                );
                return {
                  ...branch,
                  state: child ? String(child.status) : branch.state,
                };
              }),
            );
          const branches = await reread(record.branches);
          const superseded = await reread(record.superseded);
          // After the outcome, a change is history: kept, never applied.
          const late: LateResult[] =
            record.status === 'running'
              ? []
              : branches.flatMap((branch, index) => {
                  const before = record.branches[index]?.state ?? null;
                  return branch.state === before
                    ? []
                    : [
                        {
                          key: branch.key,
                          id: branch.id,
                          from: before,
                          to: branch.state,
                          at: now.toISOString(),
                        },
                      ];
                });
          return {
            branches,
            superseded,
            attention: branches
              .filter(
                (branch) =>
                  branch.lifecycle === 'workItems' && branch.state === 'failed',
              )
              .map((branch) => branch.key),
            lateResults: [...record.lateResults, ...late],
          };
        },
        effects: [concludeIfDecided, nudgeOpenBranches],
      },
      conclude: {
        title: 'Conclude',
        from: 'running',
        to: ['completed', 'failed'],
        guard: (context) => {
          const system = systemOnly(context);
          if (system !== true) return system;
          const { strategy, branches } = context.record;
          return (
            (strategy !== null &&
              evaluate(branches, strategy).result !== 'running') || {
              code: 'stillOpen',
              message: 'Required branches are still open.',
            }
          );
        },
        route: ({ record }) =>
          record.strategy &&
          evaluate(record.branches, record.strategy).result === 'completed'
            ? 'completed'
            : 'failed',
        set: (context) => {
          const { record } = context;
          const evaluation = record.strategy
            ? evaluate(record.branches, record.strategy)
            : { result: 'failed' as const, note: 'No strategy.' };
          return {
            outcome: outcome(
              evaluation.result === 'completed' ? 'completed' : 'failed',
              context,
              evaluation.note,
            ),
          };
        },
      },
      revise: {
        title: 'Change the content',
        from: 'running',
        to: ['running', 'completed'],
        guard: (context) => {
          const { record, actor, input } = context;
          if (actor.id !== record.applicantId)
            return {
              code: 'applicantOnly',
              message: 'Only the applicant changes the request.',
            };
          return plannable(context, {
            ...record.content,
            ...(input.content as JsonObject),
          });
        },
        validate: (input) =>
          typeof input.content === 'object' &&
          input.content !== null &&
          !Array.isArray(input.content)
            ? null
            : [{ field: 'content', message: 'Give the changed content.' }],
        route: (context) => planRevision(context).to,
        set: (context) => planRevision(context).values,
        onTransition: insertChildren,
      },
      cancel: {
        title: 'Cancel',
        from: ['draft', 'running'],
        to: 'cancelled',
        guard: ({ record, actor, input, services }) => {
          if (actor.system === true || actor.id === record.applicantId)
            return true;
          if (!services.org.hasRole(actor.id, APPROVAL_ADMIN))
            return {
              code: 'notAllowed',
              message:
                'Only the applicant or an approval administrator cancels.',
            };
          return (
            textOf(input, 'reason') !== '' || {
              code: 'reasonRequired',
              message: 'Say why it is cancelled.',
            }
          );
        },
        set: (context) => ({
          outcome: outcome(
            'cancelled',
            context,
            textOf(context.input, 'reason') || 'Cancelled.',
          ),
        }),
      },
    },
    onEnter: {
      running: [syncBranches],
      completed: [syncBranches, notifyOutcome],
      failed: [syncBranches, notifyOutcome],
      cancelled: [syncBranches, notifyOutcome],
    },
    triggers: {
      // A running request nobody has signalled for a while re-reads its
      // children (a lost signal heals here) and reminds whoever it waits for.
      reconcile: {
        transition: 'branchSettled',
        when: 'running',
        after: ({ reconcileAfterHours }) => reconcileAfterHours * 3_600_000,
      },
    },
  });
}
