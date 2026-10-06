import { createHash } from 'node:crypto';

import type { JsonObject, JsonValue } from '@nocobase/lifecycle';

import type { Row } from './rows.js';

/**
 * The second layer's own collections. Nothing in them is specific to one
 * business, and the task table holds nothing specific to approvals beyond an
 * answer: a to-do center can read it as it is.
 */
export const APPROVAL_COLLECTIONS: {
  readonly runs: 'approvalRuns';
  readonly tasks: 'approvalTasks';
  readonly events: 'approvalEvents';
} = Object.freeze({
  runs: 'approvalRuns',
  tasks: 'approvalTasks',
  events: 'approvalEvents',
});

/**
 * Where a task stands. `pending` and `claimed` are the person's turn;
 * `waiting` is a later turn (a sequence, a signer after someone);
 * `blocked` waits for a signer before, a consultation or material;
 * `candidate` is a pool place to take first; `suspended` is a pool place
 * someone else took. The last three end a task.
 */
export type TaskStatus =
  | 'pending'
  | 'waiting'
  | 'blocked'
  | 'candidate'
  | 'claimed'
  | 'suspended'
  | 'completed'
  | 'voided'
  | 'transferred';

/** Statuses of a task still in progress: a leave hook ends every one of them. */
export const OPEN: readonly TaskStatus[] = Object.freeze([
  'pending',
  'waiting',
  'blocked',
  'candidate',
  'claimed',
  'suspended',
]);

/** Statuses in which the assignee may answer. */
export const ACTIONABLE: readonly TaskStatus[] = Object.freeze([
  'pending',
  'claimed',
]);

/**
 * What a task asks of its assignee: a decision, an opinion that decides
 * nothing, material from the applicant, or reading a copy.
 */
export type TaskKind = 'decide' | 'consult' | 'material' | 'copy';

/**
 * A member's answer is what the stage's policy adds up; a gate stands in
 * front of a member (a signer before, a consultation, material) or behind
 * one (a signer after) and changes what that member's answer counts as.
 */
export type TaskRole = 'member' | 'gate';

export type AddMode = 'before' | 'after' | 'alongside';

export type AssignedVia =
  | 'plan'
  | 'transfer'
  | 'reassign'
  | 'escalate'
  | 'addSigner'
  | 'assign'
  | 'consult'
  | 'material'
  | 'copy';

/**
 * The states a run ends in. `concluded` is a run ended at one of the
 * approval's other exits, and `outcome` names which; `cancelled` is a run the
 * business record left before it ended, such as by a withdrawal.
 */
export const RUN_ENDS: readonly RunEnd[] = Object.freeze([
  'approved',
  'rejected',
  'returned',
  'concluded',
  'cancelled',
]);

export type RunEnd =
  'approved' | 'rejected' | 'returned' | 'concluded' | 'cancelled';

/** A run's state: the stage it waits in while open, otherwise how it ended. */
export type RunStatus = string;

/** Whether a run is still deciding: it waits in one of its stages. */
export function isOpenRun(run: { readonly status: RunStatus }): boolean {
  return !(RUN_ENDS as readonly string[]).includes(run.status);
}

/**
 * A change a stage's person proposed to the content under review. The
 * business record is not touched while the run decides: the changes are
 * applied to the run's content, in the order they were made, and settled
 * onto the record when the run ends approved or returned.
 */
export interface ContentChange {
  readonly stage: string;
  readonly taskId: string;
  readonly actorId: string;
  readonly values: JsonObject;
  readonly reason: string | null;
  readonly at: string;
}

export interface TaskRow {
  readonly id: string;
  /** The approval definition the task belongs to. */
  readonly source: string;
  readonly lifecycle: string;
  readonly recordId: string;
  readonly runId: string;
  /** The stage of the run it belongs to, and the run's version that stay began at. */
  readonly stage: string;
  readonly enteredVersion: number;
  readonly kind: TaskKind;
  readonly role: TaskRole;
  readonly mode: AddMode | null;
  /** The member task a gate stands in front of or behind. */
  readonly gates: string | null;
  /** How many hands added it: a planned task is 0, a signer it added 1. */
  readonly depth: number;
  /** The position in a sequence. */
  readonly order: number;
  /** What part of the record it is about, such as a line; null for the whole. */
  readonly subject: string | null;
  /** The responsible person. */
  readonly assigneeId: string;
  readonly via: AssignedVia;
  readonly note: string | null;
  readonly previousTaskId: string | null;
  readonly status: TaskStatus;
  readonly answer: string | null;
  readonly comment: string | null;
  readonly data: JsonObject | null;
  /** Who answered: the assignee, or a delegate acting for them. */
  readonly actorId: string | null;
  /** The content the answer was given on. */
  readonly contentHash: string | null;
  readonly requestId: string | null;
  readonly createdAt: string;
  readonly claimedAt: string | null;
  /** When the assignee is reminded, if they have not answered by then. */
  readonly remindAt: string | null;
  readonly dueAt: string | null;
  readonly closedAt: string | null;
  readonly closeReason: string | null;
  /** The order tasks were answered in, across a run. */
  readonly seq: number | null;
  readonly rowVersion: number;
}

/** One stage of a run's plan: whether it applies, why, and who was chosen at submission. */
export interface PlanEntry {
  readonly stage: string;
  readonly included: boolean;
  readonly because: string | null;
  readonly people: readonly string[] | null;
}

/**
 * A run is a record of its own lifecycle: its state is the stage it waits
 * in, then how it ended. The business record it decides waits in one state
 * meanwhile and learns only the end.
 */
export interface RunRow {
  readonly id: string;
  readonly source: string;
  /** The business record the run decides. */
  readonly lifecycle: string;
  readonly recordId: string;
  /** Whom the request is for. */
  readonly applicantId: string;
  /** The rule version the run was planned under. */
  readonly version: number;
  readonly status: RunStatus;
  /** The run's own lifecycle version: a stay in a stage begins at one. */
  readonly lifecycleVersion: number;
  readonly plan: readonly PlanEntry[];
  /** The rules the run was submitted under, which its policies read. */
  readonly settings: JsonObject;
  /** The business record's parameters at submission, which its stages read. */
  readonly parameters: JsonObject;
  /** The exit it ended at: approved, rejected, returned, another exit's name, or the transition that cancelled it. */
  readonly outcome: string | null;
  /** The frozen fields as submitted. */
  readonly submitted: JsonObject;
  /** The changes proposed since, in order. */
  readonly changes: readonly ContentChange[];
  /** The content under review: what was submitted with every change applied, and its hash. */
  readonly content: JsonObject;
  readonly contentHash: string;
  readonly previousRunId: string | null;
  /** After a return to an earlier stage, the stage that asked to be come back to. */
  readonly resumeAt: string | null;
  /** After a return to the applicant: the stage that returned it, and whether to come straight back. */
  readonly returnedBy: {
    readonly stage: string;
    readonly resume: boolean;
  } | null;
  readonly startedAt: string;
  readonly startedBy: string;
  readonly endedAt: string | null;
  readonly endedBy: string | null;
  /** The transition that ended it: an exit, a withdrawal, a cancellation. */
  readonly endedWith: string | null;
  readonly note: string | null;
  /** The last task answer number given out in the run. */
  readonly sequence: number;
  readonly rowVersion: number;
}

export interface EventRow {
  readonly id: string;
  readonly runId: string;
  readonly source: string;
  readonly lifecycle: string;
  readonly recordId: string;
  readonly stage: string | null;
  readonly taskId: string | null;
  readonly kind: string;
  readonly actorId: string;
  readonly message: string | null;
  readonly data: JsonObject;
  readonly at: string;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function json<T>(value: unknown, fallback: T): T {
  return value === null || value === undefined ? fallback : (value as T);
}

export function toTask(row: Row): TaskRow {
  return {
    id: String(row.id),
    source: String(row.source),
    lifecycle: String(row.lifecycle),
    recordId: String(row.recordId),
    runId: String(row.runId),
    stage: String(row.stage),
    enteredVersion: Number(row.enteredVersion),
    kind: row.kind as TaskKind,
    role: row.role as TaskRole,
    mode: (row.mode ?? null) as AddMode | null,
    gates: text(row.gates),
    depth: Number(row.depth ?? 0),
    order: Number(row.order ?? 0),
    subject: text(row.subject),
    assigneeId: String(row.assigneeId),
    via: row.via as AssignedVia,
    note: text(row.note),
    previousTaskId: text(row.previousTaskId),
    status: row.status as TaskStatus,
    answer: text(row.answer),
    comment: text(row.comment),
    data: json<JsonObject | null>(row.data, null),
    actorId: text(row.actorId),
    contentHash: text(row.contentHash),
    requestId: text(row.requestId),
    createdAt: String(row.createdAt),
    claimedAt: text(row.claimedAt),
    remindAt: text(row.remindAt),
    dueAt: text(row.dueAt),
    closedAt: text(row.closedAt),
    closeReason: text(row.closeReason),
    seq: row.seq === null || row.seq === undefined ? null : Number(row.seq),
    rowVersion: Number(row.rowVersion ?? 0),
  };
}

export function toRun(row: Row): RunRow {
  return {
    id: String(row.id),
    source: String(row.source),
    lifecycle: String(row.lifecycle),
    recordId: String(row.recordId),
    applicantId: String(row.applicantId),
    version: Number(row.version),
    status: String(row.status),
    lifecycleVersion: Number(row.lifecycleVersion ?? 0),
    plan: json<PlanEntry[]>(row.plan, []),
    settings: json<JsonObject>(row.settings, {}),
    parameters: json<JsonObject>(row.parameters, {}),
    outcome: text(row.outcome),
    submitted: json<JsonObject>(row.submitted, {}),
    changes: json<ContentChange[]>(row.changes, []),
    content: json<JsonObject>(row.content, {}),
    contentHash: String(row.contentHash),
    previousRunId: text(row.previousRunId),
    resumeAt: text(row.resumeAt),
    returnedBy: json<RunRow['returnedBy']>(row.returnedBy, null),
    startedAt: String(row.startedAt),
    startedBy: String(row.startedBy),
    endedAt: text(row.endedAt),
    endedBy: text(row.endedBy),
    endedWith: text(row.endedWith),
    note: text(row.note),
    sequence: Number(row.sequence ?? 0),
    rowVersion: Number(row.rowVersion ?? 0),
  };
}

export function toEvent(row: Row): EventRow {
  return {
    id: String(row.id),
    runId: String(row.runId),
    source: String(row.source),
    lifecycle: String(row.lifecycle),
    recordId: String(row.recordId),
    stage: text(row.stage),
    taskId: text(row.taskId),
    kind: String(row.kind),
    actorId: String(row.actorId),
    message: text(row.message),
    data: json<JsonObject>(row.data, {}),
    at: String(row.at),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value ?? null);
}

/** The fields of a record an approval binds its decisions to. */
export function freezeOf(
  record: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): JsonObject {
  const content: JsonObject = {};
  for (const field of fields)
    content[field] = (record[field] ?? null) as JsonValue;
  return content;
}

/** The fields of `content` that differ from `base`, with their values in `content`. */
export function changedFields(
  base: JsonObject,
  content: JsonObject,
): JsonObject {
  const changed: JsonObject = {};
  for (const field of Object.keys(content))
    if (hashOf(base, [field]) !== hashOf(content, [field]))
      changed[field] = content[field] ?? null;
  return changed;
}

/** A short hash of content, or of some of its fields. */
export function hashOf(
  content: JsonObject,
  fields: readonly string[] | null = null,
): string {
  const covered: JsonObject = {};
  for (const key of fields ?? Object.keys(content))
    covered[key] = content[key] ?? null;
  return createHash('sha256')
    .update(stableJson(covered))
    .digest('hex')
    .slice(0, 16);
}
