import type {
  JsonObject,
  JsonValue,
  LifecycleRecord,
} from '@nocobase/lifecycle';

import {
  APPROVAL_TABLES,
  type ApprovalLogKind,
  type ApprovalLogRow,
  type ApprovalStageRow,
  type ApprovalStageView,
  type ApprovalSubmission,
  type ApprovalTaskRow,
  type ApprovalTrail,
  type AssignedVia,
  type Resolver,
  type StageRule,
  type TaskKind,
  type TaskStatus,
} from '../../../shared/approval-trail.js';
import type { RecordAccess } from '../services.js';

// Rows come back from SQLite or the memory store; read each field the way
// it was written, whatever the store did to it on the way.

function str(value: unknown): string {
  if (typeof value === 'string') return value;
  return typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

function strOrNull(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? null : str(value);
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

function numOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value);
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function parsed(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function stringsOrNull(value: unknown): string[] | null {
  const list = parsed(value);
  return Array.isArray(list)
    ? list.filter((item): item is string => typeof item === 'string')
    : null;
}

function objectOrNull(value: unknown): JsonObject | null {
  const object = parsed(value);
  return typeof object === 'object' && object !== null && !Array.isArray(object)
    ? (object as JsonObject)
    : null;
}

function stageRow(row: LifecycleRecord): ApprovalStageRow {
  return {
    id: str(row.id),
    requestId: str(row.requestId),
    round: num(row.round),
    seq: num(row.seq),
    position: num(row.position),
    key: str(row.key),
    title: str(row.title),
    rule: objectOrNull(row.rule) as unknown as StageRule,
    resolver: objectOrNull(row.resolver) as unknown as Resolver,
    fields: stringsOrNull(row.fields),
    resolveAt: row.resolveAt === 'submit' ? 'submit' : 'enter',
    canRevise: bool(row.canRevise),
    escalate: bool(row.escalate),
    qualification: strOrNull(row.qualification),
    because: strOrNull(row.because),
    status: str(row.status) as ApprovalStageRow['status'],
    resolvedAt: strOrNull(row.resolvedAt),
    basis: strOrNull(row.basis),
    keptFrom: strOrNull(row.keptFrom),
  };
}

function taskRow(row: LifecycleRecord): ApprovalTaskRow {
  return {
    id: str(row.id),
    requestId: str(row.requestId),
    stageId: strOrNull(row.stageId),
    round: num(row.round),
    seq: num(row.seq),
    kind: str(row.kind) as TaskKind,
    status: str(row.status) as TaskStatus,
    assigneeId: str(row.assigneeId),
    via: str(row.via) as AssignedVia,
    previousTaskId: strOrNull(row.previousTaskId),
    note: strOrNull(row.note),
    requestedBy: strOrNull(row.requestedBy),
    prompt: strOrNull(row.prompt),
    decision: strOrNull(row.decision) as ApprovalTaskRow['decision'],
    comment: strOrNull(row.comment),
    attachments: stringsOrNull(row.attachments),
    actorId: strOrNull(row.actorId),
    revision: numOrNull(row.revision),
    contentHash: strOrNull(row.contentHash),
    claimedAt: strOrNull(row.claimedAt),
    createdAt: str(strOrNull(row.createdAt)),
    closedAt: strOrNull(row.closedAt),
    closedSeq: numOrNull(row.closedSeq),
    closeReason: strOrNull(row.closeReason),
  };
}

function logRow(row: LifecycleRecord): ApprovalLogRow {
  return {
    id: str(row.id),
    requestId: str(row.requestId),
    round: num(row.round),
    seq: num(row.seq),
    stageId: strOrNull(row.stageId),
    taskId: strOrNull(row.taskId),
    transitionId: strOrNull(row.transitionId),
    kind: str(row.kind) as ApprovalLogKind,
    actorId: strOrNull(row.actorId),
    userId: strOrNull(row.userId),
    message: strOrNull(row.message),
    data: objectOrNull(row.data),
    at: str(strOrNull(row.at)),
  };
}

function bySeq<T extends { readonly seq: number }>(rows: T[]): T[] {
  return rows.sort((a, b) => a.seq - b.seq);
}

/** A request's stages and tasks, as a transition starts from them. */
export interface LoadedApproval {
  readonly stages: readonly ApprovalStageRow[];
  readonly tasks: readonly ApprovalTaskRow[];
}

export async function loadApproval(
  records: RecordAccess,
  requestId: string,
): Promise<LoadedApproval> {
  const [stages, tasks] = await Promise.all([
    records.find(APPROVAL_TABLES.stages, { requestId }),
    records.find(APPROVAL_TABLES.tasks, { requestId }),
  ]);
  return {
    stages: bySeq(stages.map(stageRow)),
    tasks: bySeq(tasks.map(taskRow)),
  };
}

type Writable<T> = { -readonly [K in keyof T]: T[K] };

/** A log entry before the transition it belongs to has an id. */
export type PendingLog = Omit<ApprovalLogRow, 'transitionId'>;

/** What one transition writes besides the request row. */
export interface ApprovalChanges {
  readonly stages: {
    readonly insert: readonly ApprovalStageRow[];
    readonly update: readonly (readonly [string, Partial<ApprovalStageRow>])[];
  };
  readonly tasks: {
    readonly insert: readonly ApprovalTaskRow[];
    readonly update: readonly (readonly [string, Partial<ApprovalTaskRow>])[];
  };
  readonly logs: readonly PendingLog[];
}

export interface NewTask {
  readonly stageId: string | null;
  readonly kind: TaskKind;
  readonly assigneeId: string;
  readonly via: AssignedVia;
  readonly status: TaskStatus;
  readonly note?: string | null;
  readonly previousTaskId?: string | null;
  readonly requestedBy?: string | null;
  readonly prompt?: string | null;
  readonly claimedAt?: string | null;
}

export interface LogFields {
  readonly stageId?: string | null;
  readonly taskId?: string | null;
  /** Who did it; leave it out for what the approval did on its own. */
  readonly by?: string | null;
  readonly userId?: string | null;
  readonly message?: string | null;
  readonly data?: JsonObject | null;
}

/**
 * The rows one transition works on. Changes stay in memory, so `route` and
 * `set` can decide from them, and are written by `onTransition` in the
 * transition's transaction, once its log entry exists to point at.
 *
 * Every row id derives from the request and its `sequence`, which the
 * request row carries and every transition advances. Two transitions racing
 * on one request cannot both commit — the request's version refuses the
 * second — so they cannot both take a number either.
 */
export class ApprovalWork {
  public round: number;
  public currentStageId: string | null;
  private sequenceValue: number;
  private readonly stageRows: Map<string, Writable<ApprovalStageRow>> =
    new Map();
  private readonly taskRows: Map<string, Writable<ApprovalTaskRow>> = new Map();
  private readonly newStages: Set<string> = new Set();
  private readonly newTasks: Set<string> = new Set();
  private readonly stagePatches: Map<string, Partial<ApprovalStageRow>> =
    new Map();
  private readonly taskPatches: Map<string, Partial<ApprovalTaskRow>> =
    new Map();
  private readonly pendingLogs: PendingLog[] = [];

  public constructor(
    public readonly requestId: string,
    request: {
      readonly round: number;
      readonly sequence: number;
      readonly currentStageId: string | null;
    },
    loaded: LoadedApproval,
    public readonly now: string,
  ) {
    this.round = num(request.round);
    this.sequenceValue = num(request.sequence);
    this.currentStageId = strOrNull(request.currentStageId);
    for (const stage of loaded.stages)
      this.stageRows.set(stage.id, { ...stage });
    for (const task of loaded.tasks) this.taskRows.set(task.id, { ...task });
  }

  public get sequence(): number {
    return this.sequenceValue;
  }

  private next(): number {
    this.sequenceValue += 1;
    return this.sequenceValue;
  }

  public stage(id: string): ApprovalStageRow {
    const stage = this.stageRows.get(id);
    if (!stage) throw new Error(`No approval stage "${id}".`);
    return stage;
  }

  public current(): ApprovalStageRow | undefined {
    return this.currentStageId === null
      ? undefined
      : this.stageRows.get(this.currentStageId);
  }

  /** A round's plan in order; what a rule change dropped is left out. */
  public stagesOf(round: number): ApprovalStageRow[] {
    return [...this.stageRows.values()]
      .filter((stage) => stage.round === round && stage.status !== 'superseded')
      .sort((a, b) => a.position - b.position);
  }

  public tasks(where: (task: ApprovalTaskRow) => boolean): ApprovalTaskRow[] {
    return [...this.taskRows.values()]
      .filter(where)
      .sort((a, b) => a.seq - b.seq);
  }

  public tasksOf(stageId: string): ApprovalTaskRow[] {
    return this.tasks(
      (task) => task.stageId === stageId && task.kind === 'decide',
    );
  }

  public addStage(
    values: Omit<ApprovalStageRow, 'id' | 'requestId' | 'seq'>,
  ): ApprovalStageRow {
    const seq = this.next();
    const stage: Writable<ApprovalStageRow> = {
      ...values,
      id: `${this.requestId}:s${seq}`,
      requestId: this.requestId,
      seq,
    };
    this.stageRows.set(stage.id, stage);
    this.newStages.add(stage.id);
    return stage;
  }

  public updateStage(
    id: string,
    patch: Partial<ApprovalStageRow>,
  ): ApprovalStageRow {
    const stage = this.stageRows.get(id);
    if (!stage) throw new Error(`No approval stage "${id}".`);
    Object.assign(stage, patch);
    if (!this.newStages.has(id))
      this.stagePatches.set(id, { ...this.stagePatches.get(id), ...patch });
    return stage;
  }

  public addTask(values: NewTask): ApprovalTaskRow {
    const seq = this.next();
    const task: Writable<ApprovalTaskRow> = {
      id: `${this.requestId}:t${seq}`,
      requestId: this.requestId,
      stageId: values.stageId,
      round: this.round,
      seq,
      kind: values.kind,
      status: values.status,
      assigneeId: values.assigneeId,
      via: values.via,
      previousTaskId: values.previousTaskId ?? null,
      note: values.note ?? null,
      requestedBy: values.requestedBy ?? null,
      prompt: values.prompt ?? null,
      decision: null,
      comment: null,
      attachments: null,
      actorId: null,
      revision: null,
      contentHash: null,
      claimedAt: values.claimedAt ?? null,
      createdAt: this.now,
      closedAt: null,
      closedSeq: null,
      closeReason: null,
    };
    this.taskRows.set(task.id, task);
    this.newTasks.add(task.id);
    return task;
  }

  public updateTask(
    id: string,
    patch: Partial<ApprovalTaskRow>,
  ): ApprovalTaskRow {
    const task = this.taskRows.get(id);
    if (!task) throw new Error(`No approval task "${id}".`);
    Object.assign(task, patch);
    if (!this.newTasks.has(id))
      this.taskPatches.set(id, { ...this.taskPatches.get(id), ...patch });
    return task;
  }

  /** Closes a task now, in the order closings happen. */
  public closeTask(
    id: string,
    status: 'completed' | 'transferred' | 'voided',
    patch: Partial<ApprovalTaskRow> = {},
  ): ApprovalTaskRow {
    const task = this.taskRows.get(id);
    if (!task) throw new Error(`No approval task "${id}".`);
    // A decision voided later keeps when it was made.
    const answered = task.status === 'completed';
    return this.updateTask(id, {
      status,
      ...(answered ? {} : { closedAt: this.now, closedSeq: this.next() }),
      ...patch,
    });
  }

  public log(kind: ApprovalLogKind, fields: LogFields = {}): void {
    const seq = this.next();
    this.pendingLogs.push({
      id: `${this.requestId}:l${seq}`,
      requestId: this.requestId,
      round: this.round,
      seq,
      stageId: fields.stageId ?? null,
      taskId: fields.taskId ?? null,
      kind,
      actorId: fields.by ?? null,
      userId: fields.userId ?? null,
      message: fields.message ?? null,
      data: fields.data ?? null,
      at: this.now,
    });
  }

  public changes(): ApprovalChanges {
    return {
      stages: {
        insert: [...this.newStages].map((id) => this.stage(id)),
        update: [...this.stagePatches],
      },
      tasks: {
        insert: [...this.newTasks].map((id) => {
          const task = this.taskRows.get(id);
          if (!task) throw new Error(`No approval task "${id}".`);
          return task;
        }),
        update: [...this.taskPatches],
      },
      logs: [...this.pendingLogs],
    };
  }
}

function values<T extends object>(row: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value as JsonValue]),
  );
}

/** Writes one transition's changes; inside it, so they commit or roll back with it. */
export async function writeChanges(
  records: RecordAccess,
  changes: ApprovalChanges,
  transitionId: string,
): Promise<void> {
  for (const stage of changes.stages.insert)
    await records.insert(APPROVAL_TABLES.stages, values(stage));
  for (const [id, patch] of changes.stages.update)
    await records.update(APPROVAL_TABLES.stages, id, values(patch));
  for (const task of changes.tasks.insert)
    await records.insert(APPROVAL_TABLES.tasks, values(task));
  for (const [id, patch] of changes.tasks.update)
    await records.update(APPROVAL_TABLES.tasks, id, values(patch));
  for (const log of changes.logs)
    await records.insert(APPROVAL_TABLES.logs, {
      ...values(log),
      transitionId,
    });
}

function submissionOf(
  logs: readonly ApprovalLogRow[],
): ApprovalSubmission | null {
  const last = [...logs]
    .reverse()
    .find((log) => log.kind === 'submitted' || log.kind === 'revised');
  if (!last?.data) return null;
  const data = last.data;
  return {
    round: last.round,
    revision: num(data.revision),
    content: objectOrNull(data.content) ?? {},
    contentHash: str(data.contentHash),
    ruleVersion: str(data.ruleVersion),
    at: last.at,
    by: str(last.actorId),
  };
}

/** A request's stages, to-dos and handling log, shaped for reading. */
export async function approvalTrail(
  records: RecordAccess,
  request: {
    readonly id: string | number;
    readonly round: number;
    readonly currentStageId: string | null;
  },
): Promise<ApprovalTrail> {
  const requestId = String(request.id);
  const [loaded, logRows] = await Promise.all([
    loadApproval(records, requestId),
    records.find(APPROVAL_TABLES.logs, { requestId }),
  ]);
  const logs = bySeq(logRows.map(logRow));
  const view = (stage: ApprovalStageRow): ApprovalStageView => {
    const owner = stage.keptFrom ?? stage.id;
    return {
      ...stage,
      tasks: loaded.tasks.filter(
        (task) => task.stageId === owner && task.kind === 'decide',
      ),
      consultations: loaded.tasks.filter(
        (task) => task.stageId === stage.id && task.kind === 'consult',
      ),
      notes: logs
        .filter((log) => log.stageId === stage.id && log.message !== null)
        .map((log) => log.message ?? ''),
    };
  };
  const current = loaded.stages
    .filter(
      (stage) => stage.round === request.round && stage.status !== 'superseded',
    )
    .sort((a, b) => a.position - b.position);
  return {
    requestId,
    round: request.round,
    currentStageId: request.currentStageId,
    stages: current.map(view),
    history: loaded.stages
      .filter((stage) => !current.includes(stage))
      .map(view),
    materials: loaded.tasks.filter((task) => task.kind === 'supply'),
    submission: submissionOf(logs),
    logs,
  };
}

/** Reads rows of the approval tables back into their shapes, for read models. */
export const approvalRows: {
  readonly stage: (row: LifecycleRecord) => ApprovalStageRow;
  readonly task: (row: LifecycleRecord) => ApprovalTaskRow;
  readonly log: (row: LifecycleRecord) => ApprovalLogRow;
} = Object.freeze({ stage: stageRow, task: taskRow, log: logRow });
