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
  type OneOrMany,
  type TransitionContext,
  type TransitionDefinition,
} from '@nocobase/lifecycle';

import { APPROVAL_TABLES } from '../../../shared/approval-trail.js';
import { SCENARIO_COLLECTIONS, type ScenarioServices } from '../services.js';
import {
  actingAs,
  activateFrom,
  claimTask,
  closeRound,
  contentHash,
  isBlocked,
  replaceAssignee,
  resetStage,
  resolveStage,
  responsible,
  resumeStage,
  stageFromPlan,
  suspend,
  tally,
  voidTask,
  votes,
  type ActingAs,
  type ApprovalStageRow,
  type Blocked,
  type Decision,
  type ResolveContext,
} from './model.js';
import { SINGLE } from './policy.js';
import {
  ApprovalWork,
  approvalRows,
  loadApproval,
  writeChanges,
  type ApprovalChanges,
  type LoadedApproval,
} from './records.js';

export type ApprovalState =
  | 'draft'
  | 'inReview'
  | 'awaitingMaterials'
  | 'approved'
  | 'rejected'
  | 'cancelled';

/**
 * The request itself: what is asked, where it stands, and the counters its
 * transitions advance. Its stages, its to-dos and the log of how each stage
 * was handled are rows of their own, in `APPROVAL_TABLES`.
 */
export interface ApprovalRequest extends LifecycleRecord {
  readonly kind: string;
  readonly title: string;
  /** Whom the request is for: the beneficiary, whose organization picks approvers. */
  readonly applicantId: string;
  /** Who wrote the draft. */
  readonly createdBy: string;
  /** Who submitted the current round. */
  readonly submittedBy: string | null;
  /** What the request is about, such as `contract:42:priceException` (28). */
  readonly subjectKey: string | null;
  readonly content: JsonObject;
  readonly round: number;
  readonly revision: number;
  /** The rule version of the first submission, kept for every later round (3). */
  readonly ruleVersion: string | null;
  /** The hash of the content the current round decides on. */
  readonly contentHash: string | null;
  readonly submittedAt: string | null;
  /** The stage waiting for decisions; null outside review. */
  readonly currentStageId: string | null;
  /** The last number given to a stage, task or log row of this request. */
  readonly sequence: number;
  readonly parentLifecycle: string | null;
  readonly parentId: string | null;
  /** How and by whom the request ended; its status says which way. */
  readonly outcomeAt: string | null;
  readonly outcomeBy: string | null;
  readonly outcomeNote: string | null;
  readonly status: ApprovalState;
  readonly statusChangedAt: string;
}

export interface ApprovalTypes {
  record: ApprovalRequest;
  state: ApprovalState;
  parameters: {
    escalateAfterHours: number;
    claimTimeoutHours: number;
  };
  services: ScenarioServices;
}

type Context = TransitionContext<ApprovalTypes>;

/** The role that may reassign, terminate and migrate, but never decide. */
export const APPROVAL_ADMIN = 'approvalAdmin';
/** The role that may assign a pooled stage to one of its candidates (24). */
export const POOL_SUPERVISOR = 'poolSupervisor';

/** The defaults `runtime.create()` needs besides kind, title, applicant and content. */
export function draftValues(values: {
  readonly kind: string;
  readonly title: string;
  readonly applicantId: string;
  readonly createdBy?: string;
  readonly content: JsonObject;
  readonly subjectKey?: string;
  readonly parentLifecycle?: string;
  readonly parentId?: string;
}): Record<string, unknown> {
  return {
    kind: values.kind,
    title: values.title,
    applicantId: values.applicantId,
    createdBy: values.createdBy ?? values.applicantId,
    submittedBy: null,
    subjectKey: values.subjectKey ?? null,
    content: values.content,
    round: 0,
    revision: 0,
    ruleVersion: null,
    contentHash: null,
    submittedAt: null,
    currentStageId: null,
    sequence: 0,
    parentLifecycle: values.parentLifecycle ?? null,
    parentId: values.parentId ?? null,
    outcomeAt: null,
    outcomeBy: null,
    outcomeNote: null,
  };
}

// --- Reading the rows once per transition -----------------------------------
//
// `route` is synchronous, but where a decision leads depends on task rows a
// read has to fetch. Every approval transition therefore has a guard, which
// may be asynchronous and always runs first: it loads the request's rows
// once and keeps them by the record object the runtime passes to `route`,
// `set` and, as `previous`, to `onTransition`. The plan is then made once,
// from those rows, and its changes are written by `onTransition` in the
// same transaction, where the transition's log entry gives them an id.

const loading: WeakMap<object, Promise<LoadedApproval>> = new WeakMap();
const loaded: WeakMap<object, LoadedApproval> = new WeakMap();

interface Planned {
  readonly to: ApprovalState;
  readonly values: Record<string, unknown>;
  readonly changes: ApprovalChanges;
}

/**
 * Plans by the record and the input of one firing: `route`, `set` and
 * `onTransition` all see that same input object. The record alone is not
 * enough, because a store may hand back the same record object after a
 * transition planned on it rolled back.
 */
const plans: WeakMap<
  object,
  WeakMap<
    object,
    { readonly step: ApprovalTransition; readonly planned: Planned }
  >
> = new WeakMap();

function planOf(
  record: object,
  input: object,
  step: ApprovalTransition,
): Planned | undefined {
  const found = plans.get(record)?.get(input);
  return found?.step === step ? found.planned : undefined;
}

function load(context: Context): Promise<LoadedApproval> {
  const { record, services } = context;
  let pending = loading.get(record);
  if (!pending) {
    pending = loadApproval(services.records, String(record.id)).then((rows) => {
      loaded.set(record, rows);
      return rows;
    });
    loading.set(record, pending);
  }
  return pending;
}

function workOf(context: Context): ApprovalWork {
  const rows = loaded.get(context.record);
  if (!rows)
    throw new Error(
      'The approval rows are loaded by the guard; this transition has none.',
    );
  return new ApprovalWork(
    String(context.record.id),
    context.record,
    rows,
    context.now.toISOString(),
  );
}

interface Step {
  readonly to?: ApprovalState;
  readonly values?: Record<string, unknown>;
}

interface ApprovalTransition {
  readonly title: string;
  readonly from: OneOrMany<ApprovalState> | '*';
  readonly to: OneOrMany<ApprovalState>;
  readonly guard?: (
    context: Context,
    work: ApprovalWork,
  ) => GuardVerdict | Promise<GuardVerdict>;
  readonly validate?: (input: JsonObject) => InputProblem[];
  /** Changes the rows in `work` and says where the request goes and what else it writes. */
  readonly plan: (context: Context, work: ApprovalWork) => Step;
  readonly effects?: readonly EffectDefinition<ApprovalTypes>[];
}

function planned(
  record: object,
  input: object,
  step: ApprovalTransition,
): Planned {
  const done = planOf(record, input, step);
  if (done) return done;
  throw new Error('The approval transition has not been planned.');
}

function plan(
  context: Context,
  step: ApprovalTransition,
  fallback: ApprovalState,
): Planned {
  const done = planOf(context.record, context.input, step);
  if (done) return done;
  const work = workOf(context);
  const result = step.plan(context, work);
  const next: Planned = {
    to: result.to ?? fallback,
    values: {
      ...result.values,
      round: work.round,
      currentStageId: work.currentStageId,
      sequence: work.sequence,
    },
    changes: work.changes(),
  };
  const byInput = plans.get(context.record) ?? new WeakMap();
  byInput.set(context.input, { step, planned: next });
  plans.set(context.record, byInput);
  return next;
}

function approvalTransition(
  step: ApprovalTransition,
): TransitionDefinition<ApprovalTypes> {
  const targets = (
    Array.isArray(step.to) ? step.to : [step.to]
  ) as readonly ApprovalState[];
  return {
    title: step.title,
    from: step.from,
    to: step.to,
    guard: async (context) => {
      await load(context);
      return step.guard ? step.guard(context, workOf(context)) : true;
    },
    ...(step.validate ? { validate: step.validate } : {}),
    ...(targets.length > 1
      ? { route: (context: Context) => plan(context, step, targets[0]).to }
      : {}),
    set: async (context) => {
      await load(context);
      return plan(context, step, context.to).values;
    },
    onTransition: async ({ previous, input, services, entry }) => {
      await writeChanges(
        services.records,
        planned(previous, input, step).changes,
        entry.id,
      );
    },
    ...(step.effects ? { effects: step.effects } : {}),
  };
}

// --- Shared checks ----------------------------------------------------------

function resolveContext(context: Context): ResolveContext {
  return {
    org: context.services.org,
    applicantId: context.record.applicantId,
    now: context.now.toISOString(),
  };
}

function actorFor(context: Context, work: ApprovalWork): ActingAs | Blocked {
  const stage = work.current();
  if (!stage || context.record.status !== 'inReview')
    return {
      code: 'noActiveStage',
      message: 'No stage is waiting for a decision.',
    };
  return actingAs(work, stage, context.actor.id, {
    org: context.services.org,
    kind: context.record.kind,
    now: context.now.toISOString(),
    applicantId: context.record.applicantId,
  });
}

function asVerdict(value: ActingAs | Blocked): GuardVerdict {
  return isBlocked(value) ? value : true;
}

/** An assignee who acts for themselves, not through a delegation. */
function ownAssignee(context: Context, work: ApprovalWork): GuardVerdict {
  const acting = actorFor(context, work);
  if (isBlocked(acting)) return acting;
  return (
    !acting.onBehalf || {
      code: 'delegateMayNotDoThis',
      message: 'A delegate may decide, but not hand the responsibility on.',
    }
  );
}

function isApplicantSide(context: Context): GuardVerdict {
  const { record, actor } = context;
  return (
    actor.id === record.applicantId ||
    actor.id === record.submittedBy || {
      code: 'applicantOnly',
      message: 'Only the applicant or the person who submitted it can do this.',
    }
  );
}

function isAdmin(context: Context): GuardVerdict {
  return (
    context.services.org.hasRole(context.actor.id, APPROVAL_ADMIN) || {
      code: 'adminOnly',
      message: 'Only an approval administrator can do this.',
    }
  );
}

function systemOnly({ actor }: Context): GuardVerdict {
  return (
    actor.system === true || {
      code: 'systemOnly',
      message: 'The system does this.',
    }
  );
}

function all(...verdicts: GuardVerdict[]): GuardVerdict {
  return verdicts.find((verdict) => verdict !== true) ?? true;
}

function textOf(input: JsonObject, field: string): string {
  const value = input[field];
  return typeof value === 'string' ? value.trim() : '';
}

function required(...fields: string[]) {
  return (input: JsonObject): InputProblem[] =>
    fields
      .filter((field) => !textOf(input, field))
      .map((field) => ({ field, message: `"${field}" is required.` }));
}

function contentInput(input: JsonObject): boolean {
  return (
    typeof input.content === 'object' &&
    input.content !== null &&
    !Array.isArray(input.content)
  );
}

/** Records how the request ended, on the request and in its log. */
function outcome(
  work: ApprovalWork,
  context: Context,
  result: 'approved' | 'rejected' | 'cancelled',
  note: string,
): Record<string, unknown> {
  work.log('outcome', {
    by: context.actor.id,
    message: note,
    data: { result },
  });
  return {
    outcomeAt: context.now.toISOString(),
    outcomeBy: context.actor.id,
    outcomeNote: note,
  };
}

/** Someone who may take a responsibility: active, and not the applicant. */
function eligible(context: Context, person: string): GuardVerdict {
  const { org } = context.services;
  if (!person) return { code: 'noPerson', message: 'Choose a person.' };
  if (!org.isActive(person))
    return { code: 'inactive', message: `${person} can no longer act.` };
  if (person === context.record.applicantId)
    return {
      code: 'selfApproval',
      message: 'The applicant cannot decide their own request.',
    };
  return true;
}

function returnTarget(
  context: Context,
  work: ApprovalWork,
): ApprovalStageRow | 'applicant' | undefined {
  const target = textOf(context.input, 'target');
  if (target === 'applicant') return 'applicant';
  const current = work.current();
  if (!current) return undefined;
  return work
    .stagesOf(work.round)
    .find((stage) => stage.key === target && stage.position < current.position);
}

/** Pool tasks still in the pool: everyone a pooled stage may go to. */
function pool(work: ApprovalWork, stage: ApprovalStageRow): string[] {
  return work
    .tasksOf(stage.id)
    .filter(
      (task) =>
        task.status === 'pending' ||
        task.status === 'claimed' ||
        task.status === 'suspended',
    )
    .map((task) => task.assigneeId);
}

/** Settles a decided stage: everyone else's to-do of it is no longer needed. */
function settle(
  work: ApprovalWork,
  stage: ApprovalStageRow,
  result: 'approved' | 'rejected',
  content: JsonObject,
): void {
  work.updateStage(stage.id, {
    status: result,
    basis: contentHash(content, stage.fields),
  });
  for (const task of work.tasksOf(stage.id))
    if (
      task.status === 'pending' ||
      task.status === 'claimed' ||
      task.status === 'suspended'
    )
      voidTask(work, task, `The stage was ${result} without this decision.`);
  work.log(result === 'approved' ? 'stage.approved' : 'stage.rejected', {
    stageId: stage.id,
  });
  if (work.currentStageId === stage.id) work.currentStageId = null;
}

// --- Planning ---------------------------------------------------------------

/**
 * Everything a submission decides: the rule version, the plan, which
 * earlier approvals still hold, and the first stage to wait for.
 */
function planSubmission(context: Context, work: ApprovalWork): Step {
  const { record, services, actor } = context;
  const policy = services.policies.get(record.kind);
  const ruleVersion = record.ruleVersion ?? policy.currentVersion;
  const previous = record.round;
  const round = record.round + 1;
  work.round = round;
  const resolve = resolveContext(context);
  const hash = contentHash(record.content);
  work.log('submitted', {
    by: actor.id,
    data: {
      revision: 0,
      ruleVersion,
      contentHash: hash,
      content: record.content,
    },
  });
  const planned = services.policies.plan(
    record.kind,
    ruleVersion,
    record.content,
    record.applicantId,
  );
  planned.forEach((each, position) => {
    const earlier =
      policy.resubmit === 'keepValid'
        ? work
            .stagesOf(previous)
            .find(
              (stage) => stage.key === each.key && stage.status === 'approved',
            )
        : undefined;
    if (
      earlier &&
      earlier.basis === contentHash(record.content, earlier.fields)
    ) {
      const kept = work.addStage({
        ...stageFromPlan(each, round, position),
        status: 'approved',
        resolvedAt: earlier.resolvedAt,
        basis: earlier.basis,
        keptFrom: earlier.keptFrom ?? earlier.id,
      });
      work.log('stage.kept', {
        stageId: kept.id,
        message: `Round ${round}: kept from round ${previous}; the fields it covers did not change.`,
        data: { from: earlier.id },
      });
      return;
    }
    const stage = work.addStage(stageFromPlan(each, round, position));
    work.log('stage.planned', {
      stageId: stage.id,
      data: { key: stage.key, position },
    });
    if (stage.resolveAt === 'submit') resolveStage(work, stage, resolve);
  });
  const first = activateFrom(work, 0, resolve, policy);
  const values: Record<string, unknown> = {
    revision: 0,
    ruleVersion,
    // A branch the system submitted has no person who submitted it.
    submittedBy: actor.system === true ? null : actor.id,
    contentHash: hash,
    submittedAt: context.now.toISOString(),
  };
  if (first) return { to: 'inReview', values };
  return {
    to: 'approved',
    values: {
      ...values,
      ...outcome(
        work,
        context,
        'approved',
        planned.length
          ? 'Every stage was already approved.'
          : `Rule ${ruleVersion} requires no approval for this content.`,
      ),
    },
  };
}

/** A decision on the current stage: the answer, the tally, and the next stage. */
function planDecision(context: Context, work: ApprovalWork): Step {
  const { record, input, services, actor } = context;
  const stage = work.current();
  const acting = actorFor(context, work);
  if (!stage || isBlocked(acting))
    throw new LifecycleError('GUARD_REJECTED', 'Nothing to decide.');
  const decision = textOf(input, 'decision') as Decision;
  const comment = textOf(input, 'comment');
  work.closeTask(acting.task.id, 'completed', {
    decision,
    comment,
    actorId: actor.id,
    revision: record.revision,
    contentHash: record.contentHash,
  });
  work.log('task.decided', {
    stageId: stage.id,
    taskId: acting.task.id,
    by: actor.id,
    userId: acting.principal,
    data: { decision, comment, onBehalf: acting.onBehalf },
  });
  const result = tally(work, stage);
  if (result === 'open') return { to: 'inReview' };
  settle(work, stage, result, record.content);
  if (result === 'rejected')
    return {
      to: 'rejected',
      values: outcome(work, context, 'rejected', `Rejected at "${stage.key}".`),
    };
  const next = activateFrom(
    work,
    stage.position + 1,
    resolveContext(context),
    services.policies.get(record.kind),
  );
  return next
    ? { to: 'inReview' }
    : {
        to: 'approved',
        values: outcome(work, context, 'approved', 'Every stage approved.'),
      };
}

function decisionGuard(context: Context, work: ApprovalWork): GuardVerdict {
  const { record, input, services } = context;
  const acting = actorFor(context, work);
  if (isBlocked(acting)) return acting;
  const decision = textOf(input, 'decision');
  if (decision === 'abstain' && work.current()?.rule.kind !== 'threshold')
    return {
      code: 'noAbstention',
      message: 'This stage takes no abstentions.',
    };
  // A decision made on a page showing other content is refused (21).
  const seen = textOf(input, 'contentHash');
  if (seen && seen !== record.contentHash)
    return {
      code: 'staleContent',
      message: 'The content changed since you opened it; review it again.',
    };
  if (services.policies.get(record.kind).consultationsBlockDecision) {
    const open = work.tasks(
      (task) =>
        task.kind === 'consult' &&
        task.requestedBy === acting.principal &&
        task.round === record.round &&
        task.status === 'pending',
    );
    if (open.length)
      return {
        code: 'consultationOpen',
        message: `Waiting for the opinion of ${open.map((task) => task.assigneeId).join(', ')}.`,
      };
  }
  return true;
}

function validateDecision(input: JsonObject): InputProblem[] {
  const decision = textOf(input, 'decision');
  if (!['approve', 'reject', 'abstain'].includes(decision))
    return [
      { field: 'decision', message: 'Choose approve, reject or abstain.' },
    ];
  if (decision === 'reject' && !textOf(input, 'comment'))
    return [{ field: 'comment', message: 'Say why it is rejected.' }];
  return [];
}

/** Voids the approvals the new content no longer supports, oldest first. */
function planRevision(context: Context, work: ApprovalWork): Step {
  const { record, input, actor } = context;
  const changes = input.content as JsonObject;
  const content: JsonObject = { ...record.content, ...changes };
  const revision = record.revision + 1;
  const current = work.current();
  if (!current)
    throw new LifecycleError('GUARD_REJECTED', 'Nothing to revise.');
  const voided = work
    .stagesOf(work.round)
    .filter(
      (stage) =>
        stage.position <= current.position &&
        (stage.status === 'approved' ||
          work.tasksOf(stage.id).some((task) => task.status === 'completed')) &&
        contentHash(record.content, stage.fields) !==
          contentHash(content, stage.fields),
    );
  for (const stage of voided)
    resetStage(
      work,
      stage,
      `Revision ${revision} by ${actor.id} changed what this stage covered.`,
      actor.id,
    );
  const earliest = voided[0];
  const policy = context.services.policies.get(record.kind);
  if (earliest && earliest.position < current.position) {
    if (!voided.includes(current)) {
      work.updateStage(current.id, { status: 'pending' });
      suspend(work, current);
    }
    activateFrom(work, earliest.position, resolveContext(context), policy);
  } else if (voided.includes(current))
    activateFrom(work, current.position, resolveContext(context), policy);
  const hash = contentHash(content);
  work.log('revised', {
    by: actor.id,
    data: {
      revision,
      ruleVersion: record.ruleVersion ?? '',
      contentHash: hash,
      content,
      changes,
    },
  });
  return { values: { content, revision, contentHash: hash } };
}

/**
 * An administrator moves a request in flight to another rule version (3,
 * P3): stages the new plan shares by key keep their approval when the
 * fields they cover are unchanged, and the stage being decided keeps its
 * people and decisions; everything else is decided again.
 */
function planMigration(context: Context, work: ApprovalWork): Step {
  const { record, services, input, actor } = context;
  const version = textOf(input, 'version');
  const policy = services.policies.get(record.kind);
  const before = work.stagesOf(work.round);
  const reused = new Set<string>();
  services.policies
    .plan(record.kind, version, record.content, record.applicantId)
    .forEach((each, position) => {
      const fresh = stageFromPlan(each, work.round, position);
      const earlier = before.find(
        (stage) => stage.key === each.key && !reused.has(stage.id),
      );
      if (
        earlier?.status === 'approved' &&
        earlier.basis === contentHash(record.content, fresh.fields)
      ) {
        reused.add(earlier.id);
        work.updateStage(earlier.id, { position });
        work.log('stage.kept', {
          stageId: earlier.id,
          message: `Kept when moved to rule ${version}.`,
        });
        return;
      }
      if (earlier?.status === 'active' && earlier.resolvedAt !== null) {
        reused.add(earlier.id);
        suspend(work, earlier);
        work.updateStage(earlier.id, {
          position,
          title: fresh.title,
          rule: fresh.rule,
          resolver: fresh.resolver,
          fields: fresh.fields,
          resolveAt: fresh.resolveAt,
          canRevise: fresh.canRevise,
          escalate: fresh.escalate,
          qualification: fresh.qualification,
          because: fresh.because,
          status: 'pending',
        });
        work.log('stage.note', {
          stageId: earlier.id,
          message: `Carried over when moved to rule ${version}.`,
        });
        return;
      }
      const stage = work.addStage(fresh);
      work.log('stage.planned', {
        stageId: stage.id,
        data: { key: stage.key, position },
      });
    });
  const message = `Moved to rule ${version} by ${actor.id}: ${textOf(input, 'reason')}`;
  for (const stage of before) {
    if (reused.has(stage.id)) continue;
    for (const task of work.tasksOf(stage.id))
      if (
        task.status === 'pending' ||
        task.status === 'claimed' ||
        task.status === 'suspended'
      )
        voidTask(work, task, message);
    work.updateStage(stage.id, { status: 'superseded' });
    work.log('stage.superseded', { stageId: stage.id, by: actor.id, message });
  }
  work.log('stage.note', { by: actor.id, message });
  const next = activateFrom(work, 0, resolveContext(context), policy);
  return next
    ? { to: 'inReview', values: { ruleVersion: version } }
    : {
        to: 'approved',
        values: {
          ruleVersion: version,
          ...outcome(
            work,
            context,
            'approved',
            `Every stage of rule ${version} was already approved.`,
          ),
        },
      };
}

// --- Effects ----------------------------------------------------------------

/** Sends each person the current stage waits for one message per round, revision and stage. */
const notifyAssignees: EffectDefinition<ApprovalTypes> =
  defineEffect<ApprovalTypes>({
    name: 'approvalRequests.notifyAssignees',
    retry: { attempts: 3, backoffMs: 1_000 },
    // Reads the rows as they are now: a stage already decided is told nothing.
    run: async ({ record, services }) => {
      if (record.status !== 'inReview' || record.currentStageId === null)
        return { notified: [] };
      const row = await services.records.get(
        APPROVAL_TABLES.stages,
        record.currentStageId,
      );
      if (!row) return { notified: [] };
      const stage = approvalRows.stage(row);
      const people = (
        await services.records.find(APPROVAL_TABLES.tasks, {
          stageId: stage.id,
        })
      )
        .map(approvalRows.task)
        .filter(
          (task) =>
            task.kind === 'decide' &&
            (task.status === 'pending' || task.status === 'claimed'),
        )
        .map((task) => task.assigneeId);
      for (const person of people)
        await services.outbox.send(
          person,
          `To decide: ${record.title} (${stage.title})`,
          `approval:${String(record.id)}:${record.round}:${record.revision}:${stage.key}:${person}`,
        );
      return { notified: people };
    },
  });

const notifyOutcome: EffectDefinition<ApprovalTypes> =
  defineEffect<ApprovalTypes>({
    name: 'approvalRequests.notifyOutcome',
    retry: { attempts: 3, backoffMs: 1_000 },
    run: async ({ record, to, services }) => {
      for (const person of new Set([
        record.applicantId,
        record.submittedBy ?? record.applicantId,
      ]))
        await services.outbox.send(
          person,
          `${record.title}: ${to}`,
          `approval-outcome:${String(record.id)}:${record.round}:${to}:${person}`,
        );
    },
  });

/** Tells a coordinating parent that this branch settled (9, 10, 19). */
const notifyParent: EffectDefinition<ApprovalTypes> =
  defineEffect<ApprovalTypes>({
    name: 'approvalRequests.notifyParent',
    retry: { attempts: 5, backoffMs: 500 },
    run: async ({ record, to, services }) => {
      if (record.parentLifecycle === null || record.parentId === null)
        return { parent: null };
      try {
        await services.lifecycles.fire(
          record.parentLifecycle,
          record.parentId,
          'branchSettled',
          {
            actor: SYSTEM_ACTOR,
            input: {
              lifecycle: 'approvalRequests',
              id: String(record.id),
              state: to,
            },
            requestId: `approvalRequests:${String(record.id)}:${to}:${record.round}`,
          },
        );
        return { parent: record.parentId };
      } catch (error) {
        // The parent settled already, or no longer waits for branches.
        if (
          error instanceof LifecycleError &&
          ['INVALID_STATE', 'GUARD_REJECTED', 'RECORD_NOT_FOUND'].includes(
            error.code,
          )
        )
          return { parent: record.parentId, ignored: error.code };
        throw error;
      }
    },
  });

/** Read-only copies once approved (25); one per recipient however often it runs. */
const sendCarbonCopies: EffectDefinition<ApprovalTypes> =
  defineEffect<ApprovalTypes>({
    name: 'approvalRequests.sendCarbonCopies',
    retry: { attempts: 3, backoffMs: 1_000 },
    run: async ({ record, services }) => {
      const policy = services.policies.get(record.kind);
      const recipients = policy.carbonCopy?.(record.content) ?? [];
      const created: string[] = [];
      for (const recipientId of recipients) {
        const existing = await services.records.find(
          SCENARIO_COLLECTIONS.acknowledgements,
          {
            sourceLifecycle: 'approvalRequests',
            sourceId: String(record.id),
            recipientId,
          },
        );
        if (existing.length) continue;
        await services.lifecycles.create(
          'acknowledgements',
          {
            sourceLifecycle: 'approvalRequests',
            sourceId: String(record.id),
            recipientId,
            title: record.title,
            blocking: false,
          },
          { actor: SYSTEM_ACTOR },
        );
        created.push(recipientId);
      }
      return { created };
    },
  });

const STAGE_MOVES = [notifyAssignees];

// --- The lifecycle ----------------------------------------------------------

/**
 * A generic staged approval: the stages a request passes come from its
 * kind's policy and are rows of their own, so one lifecycle carries single,
 * sequential, conditional, countersigned, or-signed, voted and pooled
 * approvals. Each person's part is a task row, and each step of handling a
 * stage a log row stamped with the transition it belongs to. Every change
 * goes through a transition on the request, so concurrent decisions
 * serialize on its version.
 */
export const approvalLifecycle: Lifecycle<ApprovalTypes> =
  defineLifecycle<ApprovalTypes>({
    name: 'approvalRequests',
    collection: SCENARIO_COLLECTIONS.approvalRequests,
    initial: 'draft',
    states: [
      'draft',
      'inReview',
      'awaitingMaterials',
      { name: 'approved', final: true },
      { name: 'rejected', final: true },
      { name: 'cancelled', final: true },
    ],
    parameters: { escalateAfterHours: 72, claimTimeoutHours: 24 },
    transitions: {
      editDraft: approvalTransition({
        title: 'Edit draft',
        from: 'draft',
        to: 'draft',
        guard: ({ record, actor, services }) =>
          actor.id === record.applicantId ||
          actor.id === record.createdBy ||
          (services.policies.get(record.kind).proxySubmit === true &&
            services.org.canProxyFor(actor.id, record.applicantId)) || {
            code: 'applicantOnly',
            message:
              'Only the applicant or the draft author can edit this draft.',
          },
        validate: (input) =>
          contentInput(input)
            ? []
            : [{ field: 'content', message: 'Provide the request content.' }],
        plan: ({ input }) => ({
          values: { content: input.content as JsonObject },
        }),
      }),
      submit: approvalTransition({
        title: 'Submit',
        from: 'draft',
        to: ['inReview', 'approved'],
        guard: async ({ record, actor, services }) => {
          const policy = services.policies.get(record.kind);
          const allowed =
            actor.id === record.applicantId ||
            // A branch of a coordinated request is submitted by the system (9).
            (actor.system === true && record.parentId !== null) ||
            (policy.proxySubmit === true &&
              services.org.canProxyFor(actor.id, record.applicantId));
          if (!allowed)
            return {
              code: 'notApplicant',
              message: 'Only the applicant or an authorized proxy can submit.',
            };
          if (policy.exclusivePerSubject && record.subjectKey !== null) {
            const open = (
              await services.records.find(
                SCENARIO_COLLECTIONS.approvalRequests,
                { subjectKey: record.subjectKey },
              )
            ).filter(
              (row) =>
                row.id !== record.id &&
                (row.status === 'inReview' ||
                  row.status === 'awaitingMaterials'),
            );
            if (open.length)
              return {
                code: 'subjectBusy',
                message: `Request ${String(open[0].id)} on the same subject is still under review.`,
              };
          }
          return true;
        },
        plan: planSubmission,
        effects: STAGE_MOVES,
      }),
      decide: approvalTransition({
        title: 'Decide',
        from: 'inReview',
        to: ['inReview', 'approved', 'rejected'],
        guard: decisionGuard,
        validate: validateDecision,
        plan: planDecision,
        effects: STAGE_MOVES,
      }),
      returnTo: approvalTransition({
        title: 'Return',
        from: 'inReview',
        to: ['inReview', 'draft'],
        guard: (context, work) =>
          all(
            asVerdict(actorFor(context, work)),
            returnTarget(context, work) !== undefined || {
              code: 'badTarget',
              message: 'Return to the applicant or to an earlier stage.',
            },
          ),
        validate: required('reason', 'target'),
        plan: (context, work) => {
          const target = returnTarget(context, work);
          const current = work.current();
          const reason = `Returned by ${context.actor.id}: ${textOf(context.input, 'reason')}`;
          if (target === 'applicant' || target === undefined || !current) {
            closeRound(work, reason, context.actor.id);
            return { to: 'draft' };
          }
          for (const stage of work.stagesOf(work.round))
            if (
              stage.position >= target.position &&
              stage.position <= current.position
            )
              resetStage(work, stage, reason, context.actor.id);
          activateFrom(
            work,
            target.position,
            resolveContext(context),
            context.services.policies.get(context.record.kind),
          );
          return { to: 'inReview' };
        },
        effects: STAGE_MOVES,
      }),
      revise: approvalTransition({
        title: 'Revise the content',
        from: 'inReview',
        to: 'inReview',
        guard: (context, work) =>
          all(
            asVerdict(actorFor(context, work)),
            work.current()?.canRevise === true || {
              code: 'mayNotRevise',
              message: 'This stage may not change the content.',
            },
          ),
        validate: (input) =>
          contentInput(input)
            ? []
            : [{ field: 'content', message: 'Give the changed fields.' }],
        plan: planRevision,
        effects: STAGE_MOVES,
      }),
      withdraw: approvalTransition({
        title: 'Withdraw',
        from: ['inReview', 'awaitingMaterials'],
        to: 'draft',
        guard: isApplicantSide,
        plan: ({ actor }, work) => {
          closeRound(work, `Withdrawn by ${actor.id}.`, actor.id);
          return {};
        },
      }),
      cancel: approvalTransition({
        title: 'Cancel',
        from: '*',
        to: 'cancelled',
        guard: (context) => {
          const { record, actor } = context;
          if (actor.system === true) return true;
          if (record.status === 'draft' && actor.id === record.applicantId)
            return true;
          return all(
            isAdmin(context),
            textOf(context.input, 'reason') !== '' || {
              code: 'reasonRequired',
              message: 'An administrator terminating a request gives a reason.',
            },
          );
        },
        plan: (context, work) => {
          const note = textOf(context.input, 'reason') || 'Cancelled.';
          closeRound(work, note, context.actor.id);
          return { values: outcome(work, context, 'cancelled', note) };
        },
      }),
      transfer: approvalTransition({
        title: 'Hand over',
        from: 'inReview',
        to: 'inReview',
        guard: (context, work) => {
          const stage = work.current();
          return all(
            ownAssignee(context, work),
            eligible(context, textOf(context.input, 'to')),
            !stage ||
              !responsible(work, stage).includes(
                textOf(context.input, 'to'),
              ) || {
                code: 'alreadyAssigned',
                message: 'That person already holds this stage.',
              },
          );
        },
        validate: required('to'),
        plan: (context, work) => {
          const { actor, input } = context;
          const acting = actorFor(context, work);
          const stage = work.current();
          if (isBlocked(acting) || !stage)
            throw new LifecycleError('GUARD_REJECTED', 'Nothing to hand over.');
          const reason = textOf(input, 'reason');
          replaceAssignee(
            work,
            acting.task,
            textOf(input, 'to'),
            stage.rule.kind === 'claim' ? 'assign' : 'transfer',
            `Handed over by ${actor.id}${reason ? `: ${reason}` : ''}.`,
            actor.id,
          );
          return {};
        },
        effects: STAGE_MOVES,
      }),
      addSigner: approvalTransition({
        title: 'Add a signer',
        from: 'inReview',
        to: 'inReview',
        guard: (context, work) =>
          all(
            ownAssignee(context, work),
            context.services.policies.get(context.record.kind)
              .allowAddSigner === true || {
              code: 'noAddSigner',
              message: 'This kind of request takes no added signers.',
            },
            eligible(context, textOf(context.input, 'userId')),
            ['before', 'after', 'parallel'].includes(
              textOf(context.input, 'mode'),
            ) || {
              code: 'badMode',
              message: 'Add a signer before, after or alongside.',
            },
          ),
        validate: required('userId', 'mode'),
        plan: (context, work) => {
          const { actor, input } = context;
          const current = work.current();
          if (!current)
            throw new LifecycleError('GUARD_REJECTED', 'No stage to sign.');
          const userId = textOf(input, 'userId');
          const mode = textOf(input, 'mode');
          const note = `Added by ${actor.id} (${mode}).`;
          if (mode === 'parallel') {
            const task = work.addTask({
              stageId: current.id,
              kind: 'decide',
              assigneeId: userId,
              via: 'addSigner',
              note,
              status: 'pending',
            });
            work.log('task.assigned', {
              stageId: current.id,
              taskId: task.id,
              by: actor.id,
              userId,
              data: { via: 'addSigner', mode },
            });
            return {};
          }
          // The added stage goes right after the current one, or takes its
          // place and puts it back to wait.
          const position =
            mode === 'after' ? current.position + 1 : current.position;
          for (const stage of work.stagesOf(work.round))
            if (stage.position >= position)
              work.updateStage(stage.id, { position: stage.position + 1 });
          const added = work.addStage(
            stageFromPlan(
              {
                key: `${current.key}:${mode}:${userId}`,
                title: `${current.title} (${mode === 'before' ? 'first' : 'then'} ${userId})`,
                resolver: { kind: 'people', people: [userId] },
                rule: SINGLE,
                because: note,
              },
              work.round,
              position,
            ),
          );
          work.log('stage.added', {
            stageId: added.id,
            by: actor.id,
            userId,
            message: note,
            data: { mode, relativeTo: current.id },
          });
          if (mode === 'before') {
            work.updateStage(current.id, { status: 'pending' });
            suspend(work, current);
            activateFrom(
              work,
              position,
              resolveContext(context),
              context.services.policies.get(context.record.kind),
            );
          }
          return {};
        },
        effects: STAGE_MOVES,
      }),
      reassign: approvalTransition({
        title: 'Reassign',
        from: 'inReview',
        to: 'inReview',
        guard: (context, work) => {
          const { input, services } = context;
          const stage = work.current();
          const from = textOf(input, 'from');
          const to = textOf(input, 'to');
          if (!stage)
            return { code: 'noActiveStage', message: 'No stage to reassign.' };
          const holders =
            stage.rule.kind === 'claim'
              ? pool(work, stage)
              : responsible(work, stage);
          return all(
            isAdmin(context),
            eligible(context, to),
            from === '' ||
              holders.includes(from) || {
                code: 'notHolder',
                message: `${from} holds nothing on this stage.`,
              },
            !votes(work, stage).some((vote) => vote.assigneeId === from) || {
              code: 'alreadyDecided',
              message: `${from} has already decided; the decision stands.`,
            },
            stage.qualification === null ||
              services.org.hasRole(to, stage.qualification) ||
              input.override === true || {
                code: 'unqualified',
                message: `${to} does not hold "${stage.qualification}".`,
              },
          );
        },
        validate: required('to', 'reason'),
        plan: ({ actor, input }, work) => {
          const stage = work.current();
          if (!stage)
            throw new LifecycleError('GUARD_REJECTED', 'No stage to reassign.');
          const from = textOf(input, 'from');
          const to = textOf(input, 'to');
          const note = `Reassigned by ${actor.id}: ${textOf(input, 'reason')}${input.override === true ? ' (qualification overridden)' : ''}.`;
          if (from === '') {
            const taken = claimTask(work, stage) !== undefined;
            const task = work.addTask({
              stageId: stage.id,
              kind: 'decide',
              assigneeId: to,
              via: 'reassign',
              note,
              status:
                stage.rule.kind === 'claim' && taken ? 'suspended' : 'pending',
            });
            work.log('task.assigned', {
              stageId: stage.id,
              taskId: task.id,
              by: actor.id,
              userId: to,
              message: note,
              data: { via: 'reassign' },
            });
            return {};
          }
          const task = work
            .tasksOf(stage.id)
            .find(
              (each) =>
                each.assigneeId === from &&
                (each.status === 'pending' ||
                  each.status === 'claimed' ||
                  each.status === 'suspended'),
            );
          if (!task)
            throw new LifecycleError(
              'GUARD_REJECTED',
              `${from} holds nothing on this stage.`,
            );
          replaceAssignee(work, task, to, 'reassign', note, actor.id);
          return {};
        },
        effects: STAGE_MOVES,
      }),
      claim: approvalTransition({
        title: 'Take it',
        from: 'inReview',
        to: 'inReview',
        guard: ({ actor, services }, work) => {
          const stage = work.current();
          if (stage?.rule.kind !== 'claim')
            return { code: 'notPooled', message: 'This stage is not pooled.' };
          const taken = claimTask(work, stage);
          if (taken)
            return {
              code: 'taken',
              message: `${taken.assigneeId} has taken it.`,
            };
          return (
            (pool(work, stage).includes(actor.id) &&
              services.org.isActive(actor.id)) || {
              code: 'notCandidate',
              message: 'You are not in this pool.',
            }
          );
        },
        plan: ({ actor }, work) => {
          takeFromPool(work, actor.id, actor.id);
          return {};
        },
      }),
      release: approvalTransition({
        title: 'Put back',
        from: 'inReview',
        to: 'inReview',
        guard: ({ actor }, work) => {
          const stage = work.current();
          return (
            (stage !== undefined &&
              claimTask(work, stage)?.assigneeId === actor.id &&
              votes(work, stage).length === 0) || {
              code: 'notYours',
              message: 'Only whoever took it can put it back.',
            }
          );
        },
        plan: ({ actor }, work) => {
          putBack(work, actor.id, null);
          return {};
        },
        effects: STAGE_MOVES,
      }),
      assign: approvalTransition({
        title: 'Assign from the pool',
        from: 'inReview',
        to: 'inReview',
        guard: (context, work) => {
          const stage = work.current();
          const to = textOf(context.input, 'to');
          return all(
            context.services.org.hasRole(context.actor.id, POOL_SUPERVISOR) || {
              code: 'supervisorOnly',
              message: 'Only the pool supervisor assigns.',
            },
            (stage?.rule.kind === 'claim' &&
              votes(work, stage).length === 0) || {
              code: 'notPooled',
              message: 'This stage is not an undecided pool.',
            },
            (stage !== undefined &&
              pool(work, stage).includes(to) &&
              context.services.org.isActive(to)) || {
              code: 'notCandidate',
              message: `${to} is not an active member of this pool.`,
            },
          );
        },
        validate: required('to'),
        plan: ({ actor, input }, work) => {
          takeFromPool(work, textOf(input, 'to'), actor.id);
          return {};
        },
        effects: STAGE_MOVES,
      }),
      unclaimStale: approvalTransition({
        title: 'Return to the pool',
        from: 'inReview',
        to: 'inReview',
        guard: (context, work) => {
          const stage = work.current();
          return all(
            systemOnly(context),
            (stage?.rule.kind === 'claim' &&
              claimTask(work, stage) !== undefined &&
              votes(work, stage).length === 0) || {
              code: 'notClaimed',
              message: 'Nothing taken and left idle.',
            },
          );
        },
        plan: (_context, work) => {
          const stage = work.current();
          const taker = stage ? claimTask(work, stage) : undefined;
          putBack(
            work,
            null,
            `${taker?.assigneeId ?? ''} left it idle; back in the pool.`,
          );
          return {};
        },
        effects: STAGE_MOVES,
      }),
      escalate: approvalTransition({
        title: 'Escalate',
        from: 'inReview',
        to: 'inReview',
        guard: (context, work) => {
          const stage = work.current();
          const people = stage ? responsible(work, stage) : [];
          return all(
            systemOnly(context),
            (stage?.escalate === true &&
              stage.rule.kind === 'all' &&
              people.length === 1 &&
              votes(work, stage).length === 0) || {
              code: 'notEscalable',
              message: 'This stage does not escalate.',
            },
            (people[0] !== undefined &&
              context.services.org.managerOf(people[0]) !== undefined) || {
              code: 'topApprover',
              message: 'Nobody above the current approver.',
            },
          );
        },
        plan: ({ services }, work) => {
          const stage = work.current();
          const task = stage
            ? work.tasksOf(stage.id).find((each) => each.status === 'pending')
            : undefined;
          if (!task)
            throw new LifecycleError('GUARD_REJECTED', 'Nothing to escalate.');
          const person = task.assigneeId;
          const manager = services.org.managerOf(person) ?? person;
          replaceAssignee(
            work,
            task,
            manager,
            'escalate',
            `${person} did not act in time; passed to ${manager}.`,
            null,
          );
          return {};
        },
        effects: STAGE_MOVES,
      }),
      requestMaterials: approvalTransition({
        title: 'Ask for material',
        from: 'inReview',
        to: 'awaitingMaterials',
        guard: (context, work) => asVerdict(actorFor(context, work)),
        validate: required('request'),
        plan: ({ record, actor, input }, work) => {
          const prompt = textOf(input, 'request');
          const assigneeId = record.submittedBy ?? record.applicantId;
          const task = work.addTask({
            stageId: null,
            kind: 'supply',
            assigneeId,
            via: 'materials',
            requestedBy: actor.id,
            prompt,
            status: 'pending',
          });
          work.log('task.assigned', {
            stageId: work.currentStageId,
            taskId: task.id,
            by: actor.id,
            userId: assigneeId,
            data: { via: 'materials', prompt },
          });
          // The stage waits for the material: nobody's turn until it comes.
          const stage = work.current();
          if (stage) suspend(work, stage);
          return {};
        },
      }),
      supplyMaterials: approvalTransition({
        title: 'Supply material',
        from: 'awaitingMaterials',
        to: 'inReview',
        guard: isApplicantSide,
        validate: (input) => [
          ...required('answer')(input),
          // Supplementing never changes what is being decided; a change is a return.
          ...('content' in input
            ? [
                {
                  field: 'content',
                  message:
                    'Material cannot change the request; withdraw it to change it.',
                },
              ]
            : []),
        ],
        plan: ({ actor, input }, work) => {
          const task = work
            .tasks(
              (each) => each.kind === 'supply' && each.status === 'pending',
            )
            .at(-1);
          if (task) {
            work.closeTask(task.id, 'completed', {
              comment: textOf(input, 'answer'),
              attachments: Array.isArray(input.attachments)
                ? input.attachments.filter(
                    (item): item is string => typeof item === 'string',
                  )
                : [],
              actorId: actor.id,
            });
            work.log('task.answered', {
              stageId: work.currentStageId,
              taskId: task.id,
              by: actor.id,
              userId: task.assigneeId,
            });
          }
          const stage = work.current();
          if (stage) resumeStage(work, stage);
          return {};
        },
        effects: STAGE_MOVES,
      }),
      consult: approvalTransition({
        title: 'Ask an opinion',
        from: 'inReview',
        to: 'inReview',
        guard: (context, work) =>
          all(
            asVerdict(actorFor(context, work)),
            eligible(context, textOf(context.input, 'expertId')),
          ),
        validate: required('expertId', 'question'),
        plan: (context, work) => {
          const { actor, input } = context;
          const acting = actorFor(context, work);
          const expertId = textOf(input, 'expertId');
          const task = work.addTask({
            stageId: work.currentStageId,
            kind: 'consult',
            assigneeId: expertId,
            via: 'consult',
            requestedBy: isBlocked(acting) ? actor.id : acting.principal,
            prompt: textOf(input, 'question'),
            status: 'pending',
          });
          work.log('task.assigned', {
            stageId: work.currentStageId,
            taskId: task.id,
            by: actor.id,
            userId: expertId,
            data: { via: 'consult', prompt: task.prompt },
          });
          return {};
        },
      }),
      answerConsultation: approvalTransition({
        title: 'Give an opinion',
        from: ['inReview', 'awaitingMaterials'],
        to: ['inReview', 'awaitingMaterials'],
        guard: ({ record, actor, input }, work) =>
          work.tasks(
            (task) =>
              task.id === textOf(input, 'id') &&
              task.kind === 'consult' &&
              task.assigneeId === actor.id &&
              task.status === 'pending' &&
              task.round === record.round,
          ).length > 0 || {
            code: 'notAsked',
            message: 'No open question of yours.',
          },
        validate: required('id', 'opinion'),
        plan: ({ record, actor, input }, work) => {
          const id = textOf(input, 'id');
          const task = work.tasks((each) => each.id === id)[0];
          work.closeTask(id, 'completed', {
            comment: textOf(input, 'opinion'),
            actorId: actor.id,
          });
          work.log('task.answered', {
            stageId: task?.stageId ?? null,
            taskId: id,
            by: actor.id,
            userId: actor.id,
          });
          return { to: record.status };
        },
      }),
      migrateRules: approvalTransition({
        title: 'Move to another rule version',
        from: 'inReview',
        to: ['inReview', 'approved'],
        guard: (context) =>
          all(
            isAdmin(context),
            textOf(context.input, 'version') in
              context.services.policies.get(context.record.kind).versions || {
              code: 'unknownVersion',
              message: 'No such rule version.',
            },
          ),
        validate: required('version', 'reason'),
        plan: planMigration,
        effects: STAGE_MOVES,
      }),
    },
    onEnter: {
      approved: [notifyOutcome, notifyParent, sendCarbonCopies],
      rejected: [notifyOutcome, notifyParent],
      cancelled: [notifyParent],
    },
    triggers: {
      escalateStale: {
        transition: 'escalate',
        when: 'inReview',
        after: ({ escalateAfterHours }) => escalateAfterHours * 3_600_000,
      },
      unclaimStale: {
        transition: 'unclaimStale',
        when: 'inReview',
        after: ({ claimTimeoutHours }) => claimTimeoutHours * 3_600_000,
      },
    },
  });

/** Gives the pool to one candidate; the others wait while they hold it. */
function takeFromPool(work: ApprovalWork, person: string, by: string): void {
  const stage = work.current();
  if (!stage) return;
  for (const task of work.tasksOf(stage.id)) {
    if (task.status !== 'pending' && task.status !== 'suspended') continue;
    if (task.assigneeId === person) {
      work.updateTask(task.id, { status: 'claimed', claimedAt: work.now });
      work.log('task.claimed', {
        stageId: stage.id,
        taskId: task.id,
        by,
        userId: person,
        ...(by === person ? {} : { data: { assignedBy: by } }),
      });
    } else if (task.status === 'pending')
      work.updateTask(task.id, { status: 'suspended' });
  }
}

/** Puts a taken pool back: everyone in it may take it again. */
function putBack(
  work: ApprovalWork,
  by: string | null,
  message: string | null,
): void {
  const stage = work.current();
  const taker = stage ? claimTask(work, stage) : undefined;
  if (!stage || !taker) return;
  work.updateTask(taker.id, { claimedAt: null });
  resumeStage(work, stage);
  work.log('task.released', {
    stageId: stage.id,
    taskId: taker.id,
    by,
    userId: taker.assigneeId,
    message,
  });
}
