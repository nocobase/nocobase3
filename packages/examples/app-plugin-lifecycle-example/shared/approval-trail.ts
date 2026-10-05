import type { JsonObject } from '@nocobase/lifecycle';

/**
 * The staged approval's own records, shared by the server that writes them
 * and the pages that show them. A request keeps its stages, its to-dos and
 * the log of how each stage was handled in three tables; the lifecycle's
 * transition log records how the request itself moved. Read together, the
 * two logs are the request's complete timeline.
 */
export const APPROVAL_TABLES: {
  readonly stages: 'scenarioApprovalStages';
  readonly tasks: 'scenarioApprovalTasks';
  readonly logs: 'scenarioApprovalLogs';
} = Object.freeze({
  stages: 'scenarioApprovalStages',
  tasks: 'scenarioApprovalTasks',
  logs: 'scenarioApprovalLogs',
});

/**
 * How the decisions of one stage add up to its result.
 *
 * - `all`: every assignee must approve (countersign, and a single approver).
 *   `onReject: 'collect'` keeps collecting opinions after a rejection and
 *   rejects once everyone has answered.
 * - `first`: the first answer decides, approval or rejection (scenario 5a).
 * - `any`: one approval is enough; rejected once nobody can still approve (5b).
 * - `threshold`: `min` approvals; abstentions do not count; a rejection by a
 *   vetoer rejects; rejected once `min` can no longer be reached (7).
 * - `claim`: a pool of candidates; whoever claims it decides alone (24).
 */
export type StageRule =
  | { readonly kind: 'all'; readonly onReject: 'immediate' | 'collect' }
  | { readonly kind: 'first' }
  | { readonly kind: 'any' }
  | {
      readonly kind: 'threshold';
      readonly min: number;
      readonly vetoers: readonly string[];
    }
  | { readonly kind: 'claim' };

/** Who a stage's assignees are, resolved when the stage is planned or entered. */
export type Resolver =
  | { readonly kind: 'people'; readonly people: readonly string[] }
  /** The applicant's manager, or the manager `levels` steps up. */
  | { readonly kind: 'manager'; readonly levels?: number }
  /** One active holder of the role, or every holder with `all`. */
  | { readonly kind: 'role'; readonly role: string; readonly all?: boolean };

/**
 * `cancelled`: the round ended before the stage concluded — the request was
 * withdrawn, returned to the applicant or cancelled. `superseded`: a move to
 * another rule version dropped it from the round's plan.
 */
export type StageStatus =
  | 'pending'
  | 'active'
  | 'approved'
  | 'rejected'
  | 'skipped'
  | 'cancelled'
  | 'superseded';

/**
 * One stage of one round: the plan the request was submitted under, kept as
 * it was, and where the stage stands. `rule` and `resolver` are the policy
 * configuration the stage was planned with; they never change afterwards.
 */
export interface ApprovalStageRow {
  readonly id: string;
  readonly requestId: string;
  readonly round: number;
  /** Order of creation within the request. */
  readonly seq: number;
  /** Order within the round; a signer added before or after shifts the rest. */
  readonly position: number;
  readonly key: string;
  readonly title: string;
  readonly rule: StageRule;
  readonly resolver: Resolver;
  /** The content fields the stage's approval covers; null covers everything. */
  readonly fields: readonly string[] | null;
  readonly resolveAt: 'submit' | 'enter';
  readonly canRevise: boolean;
  readonly escalate: boolean;
  readonly qualification: string | null;
  /** Why the stage is in the plan. */
  readonly because: string | null;
  readonly status: StageStatus;
  /** When its people were chosen; null until then. */
  readonly resolvedAt: string | null;
  /** The hash of the covered content when the stage was decided. */
  readonly basis: string | null;
  /** The stage of an earlier round whose approval this one keeps. */
  readonly keptFrom: string | null;
}

/** A decision on a stage, an opinion asked of an expert, or material asked of the applicant. */
export type TaskKind = 'decide' | 'consult' | 'supply';

/**
 * - `pending`: waiting for its assignee; in a pooled stage, waiting for
 *   someone to take it.
 * - `claimed`: taken from the pool; only its assignee decides.
 * - `suspended`: not this person's turn — the stage is not active, the
 *   request waits for material, or someone else took the pool.
 * - `completed`: answered. A decision a later return or revision makes void
 *   moves on to `voided` and keeps what was decided.
 * - `transferred`: the responsibility moved to the task named by the next
 *   task's `previousTaskId`.
 * - `voided`: no longer needed; `closeReason` says why.
 */
export type TaskStatus =
  'pending' | 'claimed' | 'suspended' | 'completed' | 'transferred' | 'voided';

export type Decision = 'approve' | 'reject' | 'abstain';

/** Why a person holds a task. */
export type AssignedVia =
  | 'plan'
  | 'transfer'
  | 'reassign'
  | 'escalate'
  | 'addSigner'
  | 'assign'
  | 'consult'
  | 'materials';

/**
 * One to-do of one person. A decision names the revision and the hash of
 * the content it was made on, so what was approved is never in doubt after
 * the content changes; `actorId` differs from `assigneeId` when a delegate
 * acted.
 */
export interface ApprovalTaskRow {
  readonly id: string;
  readonly requestId: string;
  /** Null for material asked of the applicant, which belongs to no stage. */
  readonly stageId: string | null;
  readonly round: number;
  readonly seq: number;
  readonly kind: TaskKind;
  readonly status: TaskStatus;
  readonly assigneeId: string;
  readonly via: AssignedVia;
  /** The task this one took the responsibility over from. */
  readonly previousTaskId: string | null;
  /** Why it was assigned this way. */
  readonly note: string | null;
  /** Who asked, for a consultation or material. */
  readonly requestedBy: string | null;
  /** The question or the material asked for. */
  readonly prompt: string | null;
  readonly decision: Decision | null;
  /** The decision's comment, the expert's opinion or the applicant's answer. */
  readonly comment: string | null;
  readonly attachments: readonly string[] | null;
  /** Who answered: the assignee, or a delegate acting for them. */
  readonly actorId: string | null;
  readonly revision: number | null;
  readonly contentHash: string | null;
  /** When it was taken from the pool; null while it sits in the pool. */
  readonly claimedAt: string | null;
  readonly createdAt: string;
  readonly closedAt: string | null;
  /** The request's sequence number when it closed: the order answers came in. */
  readonly closedSeq: number | null;
  readonly closeReason: string | null;
}

/** What a log entry records. */
export type ApprovalLogKind =
  | 'submitted'
  | 'revised'
  | 'stage.planned'
  | 'stage.kept'
  | 'stage.added'
  | 'stage.activated'
  | 'stage.skipped'
  | 'stage.approved'
  | 'stage.rejected'
  | 'stage.reset'
  | 'stage.cancelled'
  | 'stage.superseded'
  | 'stage.note'
  | 'task.assigned'
  | 'task.decided'
  | 'task.answered'
  | 'task.transferred'
  | 'task.claimed'
  | 'task.released'
  | 'task.voided'
  | 'outcome';

/**
 * One step of how a request was handled, in the order it happened.
 * `transitionId` names the lifecycle transition the step was part of, so a
 * reader can show every transition with what it did inside the approval.
 */
export interface ApprovalLogRow {
  readonly id: string;
  readonly requestId: string;
  readonly round: number;
  readonly seq: number;
  readonly stageId: string | null;
  readonly taskId: string | null;
  readonly transitionId: string | null;
  readonly kind: ApprovalLogKind;
  /** Who did it; null for what the system decided. */
  readonly actorId: string | null;
  /** Whom it concerns: the assignee, or the principal of a delegated decision. */
  readonly userId: string | null;
  /** A sentence for people, such as why a stage was skipped. */
  readonly message: string | null;
  readonly data: JsonObject | null;
  readonly at: string;
}

/** A stage with the to-dos and the notes it gathered. */
export interface ApprovalStageView extends ApprovalStageRow {
  /**
   * Every decision task the stage has had, oldest first. A stage kept from
   * an earlier round shows the tasks of the stage whose approval it keeps.
   */
  readonly tasks: readonly ApprovalTaskRow[];
  /** Opinions asked while this stage was deciding. */
  readonly consultations: readonly ApprovalTaskRow[];
  /** The log's sentences about this stage, oldest first. */
  readonly notes: readonly string[];
}

/** The content one round was submitted, or revised, with. */
export interface ApprovalSubmission {
  readonly round: number;
  readonly revision: number;
  readonly content: JsonObject;
  readonly contentHash: string;
  readonly ruleVersion: string;
  readonly at: string;
  readonly by: string;
}

/** Everything a page needs to show how a request is being, and was, decided. */
export interface ApprovalTrail {
  readonly requestId: string;
  readonly round: number;
  readonly currentStageId: string | null;
  /** The stages of the current round, in order. */
  readonly stages: readonly ApprovalStageView[];
  /** Stages of earlier rounds, and those a rule change superseded. */
  readonly history: readonly ApprovalStageView[];
  /** Material asked of the applicant, oldest first. */
  readonly materials: readonly ApprovalTaskRow[];
  readonly submission: ApprovalSubmission | null;
  readonly logs: readonly ApprovalLogRow[];
}

/** Tasks that wait for someone now. */
export function isOpen(task: ApprovalTaskRow): boolean {
  return task.status === 'pending' || task.status === 'claimed';
}

/** Tasks still held: answered or not, but not handed on or voided. */
export function isHeld(task: ApprovalTaskRow): boolean {
  return (
    task.status === 'pending' ||
    task.status === 'claimed' ||
    task.status === 'suspended' ||
    task.status === 'completed'
  );
}

/** Whoever took the stage from its pool, while the stage stands. */
export function claimantOf(stage: ApprovalStageView): string | null {
  return (
    stage.tasks.find((task) => isHeld(task) && task.claimedAt !== null)
      ?.assigneeId ?? null
  );
}

/** A pooled stage's candidates. */
export function candidatesOf(stage: ApprovalStageView): string[] {
  return stage.rule.kind === 'claim'
    ? stage.tasks.filter(isHeld).map((task) => task.assigneeId)
    : [];
}

/** The tasks of the people responsible for the stage's decision. */
export function assigneeTasks(stage: ApprovalStageView): ApprovalTaskRow[] {
  return stage.tasks.filter(
    (task) =>
      isHeld(task) && (stage.rule.kind !== 'claim' || task.claimedAt !== null),
  );
}

/** The decisions that count for the stage, in the order they were made. */
export function votesOf(stage: ApprovalStageView): ApprovalTaskRow[] {
  return inAnswerOrder(
    stage.tasks.filter(
      (task) => task.status === 'completed' && task.decision !== null,
    ),
  );
}

/** Tasks in the order they were answered. */
export function inAnswerOrder(
  tasks: readonly ApprovalTaskRow[],
): ApprovalTaskRow[] {
  return [...tasks].sort(
    (a, b) => (a.closedSeq ?? a.seq) - (b.closedSeq ?? b.seq),
  );
}

/** Decisions a return, a revision or the end of a round made void. */
export function voidedVotesOf(stage: ApprovalStageView): ApprovalTaskRow[] {
  return inAnswerOrder(
    stage.tasks.filter(
      (task) => task.status === 'voided' && task.decision !== null,
    ),
  );
}

/** Who the stage waits for now: open tasks, or the pool nobody has taken. */
export function waitingFor(stage: ApprovalStageView): string[] {
  return stage.tasks.filter(isOpen).map((task) => task.assigneeId);
}

/** The current stage, if the request is at one. */
export function currentStage(
  trail: ApprovalTrail,
): ApprovalStageView | undefined {
  return trail.stages.find((stage) => stage.id === trail.currentStageId);
}
