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
  type LifecycleRuntime,
  type LifecycleTransaction,
  type StateHook,
  type StateHookContext,
  type TransitionContext,
} from '@nocobase/lifecycle';

import {
  APPROVAL_COLLECTIONS,
  defineApproval,
  rowsOf,
  stagesFor,
  toTaskRow,
  type Approval,
  type Row,
} from '@nocobase/app-plugin-approval/server';
import { directoryOf, text, type ScenarioServices } from './services.js';
import {
  defineWorkItemLifecycle,
  WORK_ITEMS,
  workItemValues,
  type WorkItemTypes,
  type WorkSpec,
} from './work-items.js';

// Scenarios 9, 10 and 19. A coordinated request waits in
// `running` while a set of branches its content decides goes on: each
// branch is a child record — a department review with stages of its own,
// or a work item with steps — and the request's second layer is one row per
// branch. Children are created and started in the request's own
// transaction; a child's every change reaches its branch row in the child's
// transaction, through a state hook; and the change that decides the whole
// fires the request's conclusion in that same transaction. No signal can be
// lost, repeated or late in a way that leaves the request wrong, and the
// request's version and clock move only when it concludes.

// ------------------------------------------------------------- the children

export type ReviewState =
  'draft' | 'approving' | 'approved' | 'rejected' | 'cancelled';

/** A department's review of its part of a coordinated request. */
export interface BranchReview extends LifecycleRecord {
  readonly applicantId: string;
  readonly title: string;
  readonly content: JsonObject;
  /** Who reviews first, all of them; then the lead, when there is one. */
  readonly reviewers: readonly string[];
  readonly lead: string | null;
  readonly cancelReason: string | null;
  readonly status: ReviewState;
}

export interface ReviewTypes {
  record: BranchReview;
  state: ReviewState;
  services: ScenarioServices;
}

export const BRANCH_REVIEWS = 'scenarioBranchReviews';
export const COORDINATIONS = 'scenarioCoordinations';
/** The coordinated request's second layer: one row per branch. */
export const BRANCHES = 'scenarioBranches';

const review = stagesFor<ReviewTypes>();

export const branchReviewApproval: Approval<ReviewTypes> = defineApproval<
  ReviewTypes,
  'review' | 'lead'
>({
  name: 'branchReview',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  freeze: ['content'],
  flow: ['review', 'lead'],
  stages: {
    review: review.all({
      title: 'Department review',
      escalateAfterHours: 48,
      assignees: ({ record }) => record.reviewers,
    }),
    lead: review.single({
      title: 'Department lead',
      when: ({ record }) => record.lead !== null,
      assignee: ({ record }) => record.lead,
    }),
  },
  exits: { approved: 'approve', rejected: 'reject', returned: 'return' },
  returns: { earlier: true },
  notify: ({ task, services }) =>
    services.outbox.send(
      task.assigneeId,
      `Review ${task.recordId} awaits you (${task.stage})`,
      `task:${task.id}`,
    ),
});

const tellApplicant: EffectDefinition<ReviewTypes> = defineEffect<ReviewTypes>({
  name: 'scenarioBranchReviews.tellApplicant',
  run: async ({ record, to, services }) => {
    await services.outbox.send(
      record.applicantId,
      `${record.title}: ${to}`,
      `${BRANCH_REVIEWS}:${String(record.id)}:${to}`,
    );
  },
});

// --------------------------------------------------------- the coordination

export type CoordinationState =
  'draft' | 'running' | 'completed' | 'failed' | 'cancelled';

export type BranchKind = 'approval' | 'preparation' | 'subprocess';

/** One branch a planner asks for. */
export interface BranchSpec {
  readonly key: string;
  readonly title: string;
  readonly kind: BranchKind;
  readonly required: boolean;
  /** For an approval branch: who reviews, and the lead after them. */
  readonly review?: {
    readonly reviewers: readonly string[];
    readonly lead: string | null;
  };
  readonly content?: JsonObject;
  readonly work?: WorkSpec;
  readonly because?: string;
}

export type CompletionRule =
  | { readonly kind: 'all' }
  | { readonly kind: 'atLeast'; readonly count: number };

export interface CoordinationStrategy {
  readonly rule: CompletionRule;
  /** A failed work item: wait for its owners to retry it, or fail the request. */
  readonly onBranchFailure: 'wait' | 'fail';
  /** Once the request failed: cancel the open branches, or let them finish. */
  readonly onFailure: 'cancelOpen' | 'letOpenFinish';
  /** Undo finished work once the request failed or was cancelled. */
  readonly compensate: boolean;
}

export interface CoordinationPlan {
  readonly branches: readonly BranchSpec[];
  /** Reasons the content cannot be planned. */
  readonly problems: readonly string[];
  readonly notes: readonly string[];
}

export interface CoordinationPlanner {
  readonly title: string;
  readonly strategy: CoordinationStrategy;
  plan(
    content: JsonObject,
    context: {
      readonly applicantId: string;
      readonly services: ScenarioServices;
    },
  ): CoordinationPlan;
}

export interface Coordination extends LifecycleRecord {
  readonly kind: string;
  readonly title: string;
  readonly applicantId: string;
  readonly content: JsonObject;
  readonly revision: number;
  readonly strategy: CoordinationStrategy | null;
  readonly notes: readonly string[];
  readonly outcomeNote: string | null;
  readonly outcomeBy: string | null;
  readonly status: CoordinationState;
}

export interface CoordinationTypes {
  record: Coordination;
  state: CoordinationState;
  parameters: { reconcileAfterHours: number };
  services: ScenarioServices;
}

export type BranchResult = 'succeeded' | 'failed' | 'open';

/** A branch row: the coordination's view of one child. */
export interface BranchRow {
  readonly id: string;
  readonly parentId: string;
  /** The stay of the request in `running` the branch belongs to. */
  readonly enteredVersion: number;
  readonly key: string;
  readonly title: string;
  readonly kind: BranchKind;
  readonly required: boolean;
  readonly childLifecycle: string;
  readonly childId: string;
  /** The child's state, as its last change wrote it. */
  readonly state: string;
  readonly basis: string;
  readonly revision: number;
  readonly because: string | null;
  /** `superseded` once a revision replaced it. */
  readonly status: 'active' | 'superseded';
  /** Changes of the child after the request's outcome: kept, never applied. */
  readonly late: readonly JsonObject[];
  readonly rowVersion: number;
}

function toBranch(row: Row): BranchRow {
  return {
    id: String(row.id),
    parentId: String(row.parentId),
    enteredVersion: Number(row.enteredVersion),
    key: String(row.key),
    title: String(row.title),
    kind: row.kind as BranchKind,
    required: row.required === true,
    childLifecycle: String(row.childLifecycle),
    childId: String(row.childId),
    state: String(row.state),
    basis: String(row.basis),
    revision: Number(row.revision),
    because: (row.because ?? null) as string | null,
    status: row.status as BranchRow['status'],
    late: (row.late ?? []) as JsonObject[],
    rowVersion: Number(row.rowVersion),
  };
}

export function branchResult(
  branch: Pick<BranchRow, 'childLifecycle' | 'state'>,
  strategy: CoordinationStrategy,
): BranchResult {
  const { state } = branch;
  if (branch.childLifecycle === BRANCH_REVIEWS) {
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

/** The whole's result from its required branches; optional ones never decide it. */
export function evaluate(
  branches: readonly BranchRow[],
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
          .map(({ branch }) => `Branch "${branch.key}" ended ${branch.state}.`)
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

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value ?? null);
}

function basisOf(spec: BranchSpec): string {
  return createHash('sha256')
    .update(
      stable({
        review: spec.review ?? null,
        content: spec.content ?? {},
        work: spec.work ?? null,
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

function openChild(lifecycle: string, state: string): boolean {
  return lifecycle === BRANCH_REVIEWS
    ? ['draft', 'approving'].includes(state)
    : ['pending', 'running', 'failed'].includes(state);
}

/** A refusal before anything was written: the child already moved on. */
function movedOn(error: unknown): boolean {
  return (
    error instanceof LifecycleError &&
    ['INVALID_STATE', 'GUARD_REJECTED', 'RECORD_NOT_FOUND'].includes(error.code)
  );
}

async function branchesOf(
  tx: LifecycleTransaction,
  parentId: string,
): Promise<BranchRow[]> {
  return (await rowsOf(tx.handle).find(BRANCHES, { parentId })).map(toBranch);
}

async function changeBranch(
  tx: LifecycleTransaction,
  branch: BranchRow,
  values: Partial<Omit<BranchRow, 'id' | 'rowVersion'>>,
): Promise<void> {
  const written = await rowsOf(tx.handle).update(
    BRANCHES,
    branch.id,
    { rowVersion: branch.rowVersion },
    { ...values, rowVersion: branch.rowVersion + 1 },
  );
  if (!written) throw new Error(`Branch "${branch.key}" changed meanwhile.`);
}

/**
 * The hook every child runs on entering a state, in the transaction of that
 * change: the branch row learns the child's state, and if that decides the
 * request, the request concludes — at the version its stay began at.
 */
export const reportToCoordination: StateHook<ReviewTypes> &
  StateHook<WorkItemTypes> = async (
  context: StateHookContext<ReviewTypes> | StateHookContext<WorkItemTypes>,
) => {
  const { tx, record, lifecycle, to, now } = context;
  const branch = (
    await rowsOf(tx.handle).find(BRANCHES, {
      childLifecycle: lifecycle,
      childId: String(record.id),
    })
  ).map(toBranch)[0];
  if (!branch) return;
  const parent = (await tx.read(COORDINATIONS, branch.parentId)) as
    Coordination | undefined;
  if (!parent?.strategy) return;
  const strategy = parent.strategy;
  // After the outcome, a change of what the branch came to is kept as
  // history; it never changes the outcome.
  const late =
    branch.status === 'active' &&
    (parent.status === 'completed' || parent.status === 'failed') &&
    branchResult(branch, strategy) !==
      branchResult({ childLifecycle: lifecycle, state: to }, strategy);
  await changeBranch(tx, branch, {
    state: to,
    ...(late
      ? {
          late: [
            ...branch.late,
            { from: branch.state, to, at: now.toISOString() },
          ],
        }
      : {}),
  });
  if (branch.status !== 'active') return;
  if (
    parent.status === 'running' &&
    Number(parent.lifecycleVersion) === branch.enteredVersion
  ) {
    const stay = (await branchesOf(tx, branch.parentId)).filter(
      (each) =>
        each.status === 'active' &&
        each.enteredVersion === branch.enteredVersion,
    );
    const evaluation = evaluate(stay, strategy);
    if (evaluation.result !== 'running')
      await tx.fire(COORDINATIONS, parent.id, 'conclude', {
        actor: SYSTEM_ACTOR,
        input: {
          result: evaluation.result,
          note: evaluation.note,
          by: branch.key,
        },
        expect: { version: branch.enteredVersion },
      });
    return;
  }
  // Finished work of a request that failed after all is undone as it reports.
  if (
    parent.status === 'failed' &&
    strategy.compensate &&
    lifecycle === WORK_ITEMS &&
    to === 'done'
  )
    await tx.fire(WORK_ITEMS, record.id, 'compensate', {
      actor: SYSTEM_ACTOR,
      input: { reason: `The request is ${parent.status}.` },
    });
};

export const branchReviewLifecycle: Lifecycle<ReviewTypes> = defineLifecycle({
  name: BRANCH_REVIEWS,
  initial: 'draft',
  states: [
    'draft',
    branchReviewApproval.state('approving'),
    { name: 'approved', final: true },
    { name: 'rejected', final: true },
    { name: 'cancelled', final: true },
  ],
  transitions: {
    submit: {
      from: 'draft',
      to: 'approving',
      guard: ({ record, actor }) =>
        actor.system === true ||
        actor.id === record.applicantId || {
          code: 'applicantOnly',
          message: 'Only the applicant submits it.',
        },
    },
    approve: { from: 'approving', to: 'approved', manual: false },
    reject: { from: 'approving', to: 'rejected', manual: false },
    return: { from: 'approving', to: 'draft', manual: false },
    cancel: {
      from: ['draft', 'approving'],
      to: 'cancelled',
      guard: ({ actor }) =>
        actor.system === true || {
          code: 'systemOnly',
          message: 'The coordination cancels it.',
        },
      set: ({ input }) => ({ cancelReason: text(input.reason) }),
    },
  },
  onEnter: { approved: [tellApplicant], rejected: [tellApplicant] },
  // Every state the review enters reaches its branch row; its stages
  // are its approval run's, and the branch needs only how it ends.
  onEnterState: {
    draft: reportToCoordination,
    approving: reportToCoordination,
    approved: reportToCoordination,
    rejected: reportToCoordination,
    cancelled: reportToCoordination,
  },
});

export const workItemLifecycle: Lifecycle<WorkItemTypes> =
  defineWorkItemLifecycle(reportToCoordination);

// ------------------------------------------------------------- the parent

type Context = TransitionContext<CoordinationTypes>;

const notifyOutcome: EffectDefinition<CoordinationTypes> =
  defineEffect<CoordinationTypes>({
    name: 'scenarioCoordinations.notifyOutcome',
    run: async ({ record, to, services }) => {
      await services.outbox.send(
        record.applicantId,
        `${record.title}: ${to}`,
        `${COORDINATIONS}:${String(record.id)}:${to}`,
      );
    },
  });

export function coordinationValues(values: {
  readonly kind: string;
  readonly title: string;
  readonly applicantId: string;
  readonly content: JsonObject;
  readonly strategy?: CoordinationStrategy;
}): Record<string, unknown> {
  return {
    ...values,
    revision: 0,
    strategy: values.strategy ?? null,
    notes: [],
    outcomeNote: null,
    outcomeBy: null,
  };
}

/**
 * The coordinated request. Planners are the business rules by kind: which
 * branches a request's content needs. The plan's branches become child
 * records and branch rows when the request starts.
 */
export function defineCoordinationLifecycle(
  planners: Readonly<Record<string, CoordinationPlanner>>,
): Lifecycle<CoordinationTypes> {
  const planOf = (
    record: Coordination,
    services: ScenarioServices,
    content = record.content,
  ) => {
    const planner = planners[record.kind];
    if (!planner)
      throw new LifecycleError(
        'GUARD_REJECTED',
        `No planner for "${record.kind}".`,
      );
    const plan = planner.plan(content, {
      applicantId: record.applicantId,
      services,
    });
    const problems = [...plan.problems];
    const keys = new Set<string>();
    for (const spec of plan.branches) {
      if (keys.has(spec.key))
        problems.push(`Branch "${spec.key}" appears twice.`);
      keys.add(spec.key);
    }
    return { planner, plan, problems };
  };

  const plannable = (context: Context, content: JsonObject): GuardVerdict => {
    try {
      const { problems } = planOf(context.record, context.services, content);
      return problems.length
        ? { code: 'unplannable', message: problems.join(' ') }
        : true;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  /** Creates one branch's child and row in the request's transaction; starts it after every row is in. */
  const open = async (
    context: StateHookContext<CoordinationTypes>,
    spec: BranchSpec,
    revision: number,
  ): Promise<() => Promise<void>> => {
    const { record, tx } = context;
    const childTitle = `${record.title} · ${spec.title}`;
    const created =
      spec.kind === 'approval'
        ? await tx.create(
            BRANCH_REVIEWS,
            {
              applicantId: record.applicantId,
              title: childTitle,
              content: spec.content ?? {},
              reviewers: spec.review?.reviewers ?? [],
              lead: spec.review?.lead ?? null,
              cancelReason: null,
            },
            { actor: SYSTEM_ACTOR },
          )
        : await tx.create(
            WORK_ITEMS,
            workItemValues({
              title: childTitle,
              work: spec.work ?? {
                definition: 'none',
                steps: [],
                ownerRole: 'approvalAdmin',
              },
              businessKey: `${COORDINATIONS}:${String(record.id)}:${spec.key}:r${revision}`,
            }),
            { actor: SYSTEM_ACTOR },
          );
    const lifecycle = spec.kind === 'approval' ? BRANCH_REVIEWS : WORK_ITEMS;
    await rowsOf(tx.handle).insert(BRANCHES, {
      parentId: String(record.id),
      enteredVersion: Number(record.lifecycleVersion),
      key: spec.key,
      title: spec.title,
      kind: spec.kind,
      required: spec.required,
      childLifecycle: lifecycle,
      childId: String(created.record.id),
      state: String(created.record.status),
      basis: basisOf(spec),
      revision,
      because: spec.because ?? null,
      status: 'active',
      late: [],
      rowVersion: 0,
    });
    return async () => {
      try {
        await tx.fire(
          lifecycle,
          created.record.id,
          lifecycle === BRANCH_REVIEWS ? 'submit' : 'start',
          {
            actor: SYSTEM_ACTOR,
          },
        );
      } catch (error) {
        // A branch that settled the request first cancelled this one.
        if (!movedOn(error)) throw error;
      }
    };
  };

  const enterRunning: StateHook<CoordinationTypes> = async (context) => {
    const { record, tx, from, services } = context;
    const { plan } = planOf(record, services);
    const version = Number(record.lifecycleVersion);
    const starts: (() => Promise<void>)[] = [];
    if (from === 'draft') {
      for (const spec of plan.branches)
        starts.push(await open(context, spec, record.revision));
    } else {
      // A revision: a branch whose basis did not change keeps its child and
      // what it decided; anything else is decided again by a new child.
      const current = (await branchesOf(tx, String(record.id))).filter(
        (branch) => branch.status === 'active',
      );
      const kept: string[] = [];
      const added: string[] = [];
      for (const spec of plan.branches) {
        const existing = current.find((branch) => branch.key === spec.key);
        if (
          existing &&
          existing.basis === basisOf(spec) &&
          branchResult(existing, record.strategy as CoordinationStrategy) !==
            'failed'
        ) {
          kept.push(spec.key);
          await changeBranch(tx, existing, {
            enteredVersion: version,
            required: spec.required,
          });
          continue;
        }
        added.push(spec.key);
        starts.push(await open(context, spec, record.revision));
      }
      const keptIds = new Set(kept);
      const superseded = current.filter((branch) => !keptIds.has(branch.key));
      for (const branch of superseded) {
        await changeBranch(tx, branch, { status: 'superseded' });
        if (openChild(branch.childLifecycle, branch.state))
          await tx.fire(branch.childLifecycle, branch.childId, 'cancel', {
            actor: SYSTEM_ACTOR,
            input: { reason: `Superseded by revision ${record.revision}.` },
          });
      }
      await rowsOf(tx.handle).insert('scenarioCoordinationNotes', {
        parentId: String(record.id),
        message: `Revision ${record.revision} by ${context.actor.id}: kept [${kept.join(', ')}], new [${added.join(', ')}], superseded [${superseded.map((branch) => branch.key).join(', ')}].`,
      });
    }
    for (const start of starts) await start();
    // Started, the branches may already decide it: a revision that left
    // nothing open, or children that finished on the spot.
    const now = (await tx.read(COORDINATIONS, record.id)) as Coordination;
    if (now.status !== 'running' || Number(now.lifecycleVersion) !== version)
      return;
    const evaluation = evaluate(
      (await branchesOf(tx, String(record.id))).filter(
        (branch) =>
          branch.status === 'active' && branch.enteredVersion === version,
      ),
      record.strategy as CoordinationStrategy,
    );
    if (evaluation.result !== 'running')
      await tx.fire(COORDINATIONS, record.id, 'conclude', {
        actor: SYSTEM_ACTOR,
        input: { result: evaluation.result, note: evaluation.note },
      });
  };

  /** Leaving `running` for an outcome winds the branches down as the strategy says. */
  const leaveRunning: StateHook<CoordinationTypes> = async ({
    record,
    tx,
    to,
  }) => {
    if (to === 'running') return;
    const strategy = record.strategy as CoordinationStrategy;
    const winding =
      to === 'cancelled' ||
      (to === 'failed' && strategy.onFailure === 'cancelOpen');
    const undo = strategy.compensate && (to === 'failed' || to === 'cancelled');
    for (const branch of (await branchesOf(tx, String(record.id))).filter(
      (each) => each.status === 'active',
    )) {
      const child = await tx.read(branch.childLifecycle, branch.childId);
      if (!child) continue;
      const state = String(child.status);
      try {
        if (winding && openChild(branch.childLifecycle, state))
          await tx.fire(branch.childLifecycle, branch.childId, 'cancel', {
            actor: SYSTEM_ACTOR,
            input: { reason: `The request is ${to}.` },
          });
        else if (
          undo &&
          branch.childLifecycle === WORK_ITEMS &&
          state === 'done'
        )
          await tx.fire(WORK_ITEMS, branch.childId, 'compensate', {
            actor: SYSTEM_ACTOR,
            input: { reason: `The request is ${to}.` },
          });
      } catch (error) {
        if (!movedOn(error)) throw error;
      }
    }
  };

  return defineLifecycle<CoordinationTypes>({
    name: COORDINATIONS,
    initial: 'draft',
    states: [
      'draft',
      'running',
      { name: 'completed', final: true },
      { name: 'failed', final: true },
      { name: 'cancelled', final: true },
    ],
    parameters: { reconcileAfterHours: 24 },
    transitions: {
      start: {
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
        route: ({ record, services }) =>
          planOf(record, services).plan.branches.length
            ? 'running'
            : 'completed',
        set: ({ record, services }) => {
          const { planner, plan } = planOf(record, services);
          return {
            revision: 1,
            strategy: record.strategy ?? planner.strategy,
            notes: [
              ...plan.notes,
              ...plan.branches.map(
                (spec) => `${spec.key}: ${spec.because ?? 'planned'}`,
              ),
            ],
            ...(plan.branches.length
              ? {}
              : {
                  outcomeNote:
                    `No branch is needed. ${plan.notes.join(' ')}`.trim(),
                }),
          };
        },
      },
      revise: {
        title: 'Change the content',
        from: 'running',
        to: 'running',
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
        set: ({ record, input }) => ({
          content: { ...record.content, ...(input.content as JsonObject) },
          revision: record.revision + 1,
        }),
      },
      conclude: {
        title: 'Conclude',
        from: 'running',
        to: ['completed', 'failed'],
        manual: false,
        route: ({ input }) =>
          input.result === 'completed' ? 'completed' : 'failed',
        set: ({ input }) => ({
          outcomeNote: text(input.note),
          outcomeBy: SYSTEM_ACTOR.id,
        }),
      },
      cancel: {
        from: ['draft', 'running'],
        to: 'cancelled',
        guard: ({ record, actor, input, services }) => {
          if (actor.system === true || actor.id === record.applicantId)
            return true;
          if (!services.org.hasRole(actor.id, 'approvalAdmin'))
            return {
              code: 'notAllowed',
              message:
                'Only the applicant or an approval administrator cancels.',
            };
          return (
            text(input.reason) !== null || {
              code: 'reasonRequired',
              message: 'Say why it is cancelled.',
            }
          );
        },
        set: ({ actor, input }) => ({
          outcomeNote: text(input.reason) ?? 'Cancelled.',
          outcomeBy: actor.id,
        }),
      },
    },
    onEnter: {
      completed: [notifyOutcome],
      failed: [notifyOutcome],
      cancelled: [notifyOutcome],
    },
    onEnterState: { running: enterRunning },
    onLeaveState: { running: leaveRunning },
  });
}

// ------------------------------------------------------------ reading

export interface BranchView extends BranchRow {
  readonly child: LifecycleRecord | undefined;
}

export function branchViews(
  runtime: LifecycleRuntime,
  parentId: string,
): Promise<BranchView[]> {
  return runtime.transaction(async (tx) => {
    const rows = await branchesOf(tx, parentId);
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        child: await tx.read(row.childLifecycle, row.childId),
      })),
    );
  });
}

export function coordinationNotes(
  runtime: LifecycleRuntime,
  parentId: string,
): Promise<string[]> {
  return runtime.transaction(async (tx) =>
    (
      await rowsOf(tx.handle).find('scenarioCoordinationNotes', { parentId })
    ).map((row) => String(row.message)),
  );
}

/**
 * Reminds whoever an open branch has waited on for longer than the
 * request's `reconcileAfterHours`, judged by that branch's own idleness: a
 * fast branch beside a slow one no longer postpones the slow one's reminder.
 * Run it on the sweep's schedule. Returns how many reminders it sent.
 */
export async function remindCoordinations(
  runtime: LifecycleRuntime,
  services: ScenarioServices,
): Promise<number> {
  const after = Number(
    (runtime.parameters(COORDINATIONS) as { reconcileAfterHours?: number })
      .reconcileAfterHours ?? 24,
  );
  return runtime.transaction(async (tx) => {
    const rows = rowsOf(tx.handle);
    const threshold = new Date(
      tx.now.getTime() - after * 3_600_000,
    ).toISOString();
    let sent = 0;
    for (const parent of (await rows.find(COORDINATIONS, {
      status: 'running',
    })) as Coordination[]) {
      const strategy = parent.strategy as CoordinationStrategy;
      for (const branch of (await branchesOf(tx, String(parent.id))).filter(
        (each) =>
          each.status === 'active' &&
          each.enteredVersion === Number(parent.lifecycleVersion) &&
          branchResult(each, strategy) === 'open',
      )) {
        const child = await tx.read(branch.childLifecycle, branch.childId);
        if (!child || String(child.statusChangedAt) >= threshold) continue;
        const people =
          branch.childLifecycle === BRANCH_REVIEWS
            ? (
                await rows.find(APPROVAL_COLLECTIONS.tasks, {
                  lifecycle: BRANCH_REVIEWS,
                  recordId: branch.childId,
                })
              )
                .map(toTaskRow)
                .filter(
                  (task) =>
                    task.status === 'pending' || task.status === 'claimed',
                )
                .map((task) => task.assigneeId)
            : child.status === 'failed'
              ? services.org
                  .holders(String(child.ownerRole))
                  .filter((person) => services.org.isActive(person))
              : [];
        for (const person of people) {
          await services.outbox.send(
            person,
            `Reminder: ${parent.title} waits for ${branch.title}`,
            `remind:${branch.id}:${String(child.lifecycleVersion)}:${person}`,
          );
          sent += 1;
        }
      }
    }
    return sent;
  });
}

// ------------------------------------------------------------ planners

export interface DepartmentReview {
  readonly department: string;
  readonly title: string;
  /** The role whose holders review, or the people; and a lead role after them. */
  readonly reviewers: string | readonly string[];
  readonly lead?: string;
  readonly required?: boolean;
}

export interface PurchaseItem {
  readonly category: string;
  readonly name: string;
  readonly amount: number;
}

function purchaseItems(content: JsonObject): PurchaseItem[] {
  const items = Array.isArray(content.items) ? content.items : [];
  return items.flatMap((item) =>
    typeof item === 'object' &&
    item !== null &&
    !Array.isArray(item) &&
    typeof item.category === 'string'
      ? [
          {
            category: item.category,
            name: typeof item.name === 'string' ? item.name : item.category,
            amount: typeof item.amount === 'number' ? item.amount : 0,
          },
        ]
      : [],
  );
}

export const PURCHASE_STRATEGY: CoordinationStrategy = Object.freeze({
  rule: { kind: 'all' } as const,
  onBranchFailure: 'fail',
  onFailure: 'cancelOpen',
  compensate: false,
});

/** Scenario 9: each department whose categories the items touch reviews its own items. */
export function purchasePlanner(
  categories: ReadonlyMap<string, DepartmentReview>,
  exempt: ReadonlySet<string> = new Set(),
): CoordinationPlanner {
  return {
    title: 'Purchase',
    strategy: PURCHASE_STRATEGY,
    plan: (content, { services }) => {
      const byDepartment = new Map<
        string,
        { review: DepartmentReview; items: PurchaseItem[] }
      >();
      const problems: string[] = [];
      const notes: string[] = [];
      for (const item of purchaseItems(content)) {
        const review = categories.get(item.category);
        if (!review) {
          if (exempt.has(item.category))
            notes.push(
              `${item.name} (${item.category}) needs no department review.`,
            );
          else
            problems.push(
              `No department reviews the category "${item.category}".`,
            );
          continue;
        }
        const entry = byDepartment.get(review.department) ?? {
          review,
          items: [],
        };
        entry.items.push(item);
        byDepartment.set(review.department, entry);
      }
      return {
        branches: [...byDepartment.values()].map(({ review, items }) => ({
          key: review.department,
          title: review.title,
          kind: 'approval' as const,
          required: review.required ?? true,
          review: {
            reviewers:
              typeof review.reviewers === 'string'
                ? services.org.holders(review.reviewers)
                : [...review.reviewers],
            lead: review.lead
              ? (services.org.holderOf(review.lead) ?? null)
              : null,
          },
          content: {
            department: review.department,
            items: items.map((item) => ({ ...item })),
            amount: items.reduce((sum, item) => sum + item.amount, 0),
          },
          because: `Items ${items.map((item) => item.category).join(', ')} are reviewed by ${review.title}.`,
        })),
        problems,
        notes,
      };
    },
  };
}

export const LAUNCH_STRATEGY: CoordinationStrategy = Object.freeze({
  rule: { kind: 'all' } as const,
  onBranchFailure: 'fail',
  onFailure: 'cancelOpen',
  compensate: true,
});

export const OPS_PREPARATION: WorkSpec = Object.freeze({
  definition: 'launchPreparation@v1',
  ownerRole: 'ops',
  steps: [
    { key: 'provisionServers', title: 'Provision servers' },
    { key: 'configureMonitoring', title: 'Configure monitoring' },
  ],
});

/** Scenario 10: three reviews with chains of their own, and a preparation that approves nothing. */
export function launchPlanner(): CoordinationPlanner {
  return {
    title: 'Product launch',
    strategy: LAUNCH_STRATEGY,
    plan: (content) => ({
      branches: [
        {
          key: 'security',
          title: 'Security review',
          kind: 'approval',
          required: true,
          review: { reviewers: ['secEng'], lead: 'secLead' },
          content,
          because: 'Every launch.',
        },
        {
          key: 'legal',
          title: 'Legal review',
          kind: 'approval',
          required: true,
          review: { reviewers: ['legalA', 'legalB'], lead: 'legalLead' },
          content,
          because: 'Every launch.',
        },
        {
          key: 'finance',
          title: 'Finance review',
          kind: 'approval',
          required: true,
          review: { reviewers: ['finA'], lead: null },
          content,
          because: 'Every launch.',
        },
        {
          key: 'ops',
          title: 'Operations preparation',
          kind: 'preparation',
          required: true,
          work: OPS_PREPARATION,
          because: 'Every launch needs servers.',
        },
      ],
      problems: [],
      notes: [],
    }),
  };
}

export interface OnboardingDefinitions {
  it: WorkSpec;
  admin: WorkSpec;
  hr: WorkSpec;
}

export const ONBOARDING_STRATEGY: CoordinationStrategy = Object.freeze({
  rule: { kind: 'all' } as const,
  onBranchFailure: 'wait',
  onFailure: 'cancelOpen',
  compensate: true,
});

/** Scenario 19: IT, administration and HR sub-processes; a remote hire's desk is optional. */
export function onboardingPlanner(
  definitions: OnboardingDefinitions,
): CoordinationPlanner {
  return {
    title: 'Onboarding',
    strategy: ONBOARDING_STRATEGY,
    plan: (content) => {
      const remote = content.remote === true;
      return {
        branches: [
          {
            key: 'it',
            title: 'IT onboarding',
            kind: 'subprocess',
            required: true,
            work: definitions.it,
          },
          {
            key: 'admin',
            title: 'Administration onboarding',
            kind: 'subprocess',
            required: !remote,
            work: definitions.admin,
            because: remote
              ? 'Remote hire: a desk is not a condition.'
              : 'On-site hire.',
          },
          {
            key: 'hr',
            title: 'HR onboarding',
            kind: 'subprocess',
            required: true,
            work: definitions.hr,
          },
        ],
        problems: [],
        notes: [],
      };
    },
  };
}
