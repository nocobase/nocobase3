import {
  SYSTEM_ACTOR,
  type FireResult,
  type JsonObject,
  type LifecycleActor,
  type LifecycleRecord,
  type LifecycleTransaction,
  type LifecycleTypes,
  type ServicesOf,
} from '@nocobase/lifecycle';

import { ApprovalError } from './errors.js';
import {
  ACTIONABLE,
  APPROVAL_COLLECTIONS,
  OPEN,
  isOpenRun,
  toEvent,
  toRun,
  toTask,
  type EventRow,
  type RunRow,
  type TaskRow,
  type TaskStatus,
} from './model.js';
import type { PolicyTask, StageDecision, StageEvent } from './policies.js';
import { rowsOf, type Rows } from './rows.js';
import type { Approval, ApprovalDirectory, StageDefinition } from './types.js';

const { runs: RUNS, tasks: TASKS, events: EVENTS } = APPROVAL_COLLECTIONS;

/** A task's fields that a new row needs; the rest have defaults. */
export type NewTask = Pick<
  TaskRow,
  'lifecycle' | 'recordId' | 'runId' | 'stage' | 'enteredVersion' | 'assigneeId'
> &
  Partial<
    Omit<
      TaskRow,
      | 'id'
      | 'lifecycle'
      | 'recordId'
      | 'runId'
      | 'stage'
      | 'enteredVersion'
      | 'assigneeId'
    >
  >;

/** What settling a stage came to. */
export type Settled =
  | { readonly kind: 'open' }
  | {
      readonly kind: 'closed';
      readonly transition: string;
      readonly to: string;
      readonly fired: FireResult;
    };

/** Gates that hold a member until they are answered. */
function holds(gate: TaskRow, blockingConsultations: boolean): boolean {
  if (gate.role !== 'gate' || !OPEN.includes(gate.status)) return false;
  if (gate.kind === 'consult') return blockingConsultations;
  return gate.kind === 'material' || gate.mode === 'before';
}

function live(task: TaskRow): boolean {
  return task.status !== 'voided' && task.status !== 'transferred';
}

/**
 * What each member's answer counts as once its gates are considered: a
 * signer's rejection is the member's rejection, and an approval still
 * waiting for a signer after it is no answer yet.
 */
export function memberViews(stay: readonly TaskRow[]): PolicyTask[] {
  return stay
    .filter((task) => task.role === 'member' && task.kind === 'decide')
    .filter(live)
    .map((member) => {
      const gates = stay.filter(
        (gate) =>
          gate.role === 'gate' &&
          gate.kind === 'decide' &&
          gate.gates === member.id &&
          live(gate),
      );
      let answer = member.status === 'completed' ? member.answer : null;
      let seq = member.seq;
      const vetoed = gates.find(
        (gate) => gate.status === 'completed' && gate.answer === 'reject',
      );
      if (vetoed) {
        answer = 'reject';
        seq = vetoed.seq;
      } else if (
        answer === 'approve' &&
        gates.some((gate) => gate.mode === 'after' && gate.answer !== 'approve')
      )
        answer = null;
      else if (answer === 'approve') {
        const last = gates
          .filter((gate) => gate.mode === 'after')
          .map((gate) => gate.seq ?? 0);
        seq = Math.max(seq ?? 0, ...last);
      }
      return {
        id: member.id,
        assigneeId: member.assigneeId,
        status:
          member.status === 'completed' && answer === null
            ? 'pending'
            : member.status,
        answer,
        order: member.order,
        seq,
        subject: member.subject,
        data: member.data,
      };
    });
}

/**
 * The second layer's work inside one transaction: reading and writing runs,
 * tasks and events through the transaction's handle, and moving the run on
 * through the same transaction when a stage concludes.
 */
export class ApprovalWork<T extends LifecycleTypes> {
  public readonly rows: Rows;
  public readonly at: string;

  public constructor(
    public readonly approval: Approval<T>,
    public readonly tx: LifecycleTransaction,
    public readonly services: ServicesOf<T>,
    public readonly now: Date,
  ) {
    this.rows = rowsOf(tx.handle);
    this.at = now.toISOString();
  }

  public get directory(): ApprovalDirectory {
    return this.approval.options.directory(this.services);
  }

  // ------------------------------------------------------------- reading

  public async run(id: string): Promise<RunRow> {
    const row = await this.rows.get(RUNS, id);
    if (!row) throw new Error(`No approval run "${id}".`);
    return toRun(row);
  }

  public async runs(lifecycle: string, recordId: string): Promise<RunRow[]> {
    return (
      await this.rows.find(RUNS, {
        source: this.approval.name,
        lifecycle,
        recordId,
      })
    ).map(toRun);
  }

  public async openRun(
    lifecycle: string,
    recordId: string,
  ): Promise<RunRow | undefined> {
    return (await this.runs(lifecycle, recordId)).filter(isOpenRun).at(-1);
  }

  public async task(id: string): Promise<TaskRow> {
    const row = await this.rows.get(TASKS, id);
    if (!row) throw new ApprovalError('TASK_NOT_FOUND', `No task "${id}".`);
    return toTask(row);
  }

  /** The tasks of one stay of the record in a stage. */
  public async stay(
    run: RunRow,
    stage: string,
    enteredVersion?: number,
  ): Promise<TaskRow[]> {
    return (await this.rows.find(TASKS, { runId: run.id, stage }))
      .map(toTask)
      .filter(
        (task) =>
          enteredVersion === undefined ||
          task.enteredVersion === enteredVersion,
      );
  }

  public async events(run: RunRow, kind?: string): Promise<EventRow[]> {
    return (
      await this.rows.find(EVENTS, {
        runId: run.id,
        ...(kind === undefined ? {} : { kind }),
      })
    ).map(toEvent);
  }

  /** How a stage concluded in a run, if it did; the last conclusion counts. */
  public async concluded(
    run: RunRow,
    stage: string,
  ): Promise<string | undefined> {
    const event = (await this.events(run, 'stage.concluded'))
      .filter((each) => each.stage === stage)
      .at(-1);
    const result = event?.data.result;
    return typeof result === 'string' ? result : undefined;
  }

  // ------------------------------------------------------------- writing

  public async log(
    run: RunRow,
    event: {
      readonly kind: string;
      readonly stage?: string | null;
      readonly taskId?: string | null;
      readonly actorId: string;
      readonly message?: string | null;
      readonly data?: JsonObject;
    },
  ): Promise<EventRow> {
    return toEvent(
      await this.rows.insert(EVENTS, {
        runId: run.id,
        source: run.source,
        lifecycle: run.lifecycle,
        recordId: run.recordId,
        stage: event.stage ?? null,
        taskId: event.taskId ?? null,
        kind: event.kind,
        actorId: event.actorId,
        message: event.message ?? null,
        data: event.data ?? {},
        at: this.at,
      }),
    );
  }

  public async insertRun(values: Omit<RunRow, 'id'>): Promise<RunRow> {
    return toRun(await this.rows.insert(RUNS, values));
  }

  public async changeRun(
    run: RunRow,
    values: Partial<Omit<RunRow, 'id' | 'rowVersion'>>,
  ): Promise<RunRow> {
    const written = await this.rows.update(
      RUNS,
      run.id,
      { rowVersion: run.rowVersion },
      { ...values, rowVersion: run.rowVersion + 1 },
    );
    if (!written)
      throw new ApprovalError(
        'CONFLICT',
        `Approval run "${run.id}" changed meanwhile.`,
      );
    return this.run(run.id);
  }

  public async addTask(values: NewTask): Promise<TaskRow> {
    const task = toTask(
      await this.rows.insert(TASKS, {
        source: this.approval.name,
        kind: 'decide',
        role: 'member',
        mode: null,
        gates: null,
        depth: 0,
        order: 0,
        subject: null,
        via: 'plan',
        note: null,
        previousTaskId: null,
        status: 'pending',
        answer: null,
        comment: null,
        data: null,
        actorId: null,
        contentHash: null,
        requestId: null,
        createdAt: this.at,
        claimedAt: null,
        remindAt: null,
        dueAt: null,
        closedAt: null,
        closeReason: null,
        seq: null,
        rowVersion: 0,
        ...values,
      }),
    );
    this.announce(task);
    return task;
  }

  /**
   * Changes a task only while it is as it was read: the serialization point
   * between two events on one task, such as an answer and a withdrawal.
   */
  public async change(
    task: TaskRow,
    values: Partial<Omit<TaskRow, 'id' | 'rowVersion'>>,
  ): Promise<TaskRow> {
    const written = await this.rows.update(
      TASKS,
      task.id,
      { status: task.status, rowVersion: task.rowVersion },
      { ...values, rowVersion: task.rowVersion + 1 },
    );
    if (!written)
      throw new ApprovalError(
        'CONFLICT',
        `Task "${task.id}" changed meanwhile; read it again.`,
      );
    const changed = await this.task(task.id);
    if (changed.status !== task.status) this.announce(changed);
    return changed;
  }

  /** Tells the assignee once the task is theirs to act on, after the commit. */
  private announce(task: TaskRow): void {
    const notify = this.approval.options.notify;
    if (
      !notify ||
      !(['pending', 'claimed', 'candidate'] as TaskStatus[]).includes(
        task.status,
      )
    )
      return;
    const services = this.services;
    this.tx.afterCommit(() => notify({ task, services, reason: 'assigned' }));
  }

  /** Ends every task of a stay still in progress. */
  public async endStay(
    run: RunRow,
    stage: string,
    reason: string,
    actorId: string,
  ): Promise<void> {
    for (const task of await this.stay(run, stage))
      if (OPEN.includes(task.status)) {
        await this.change(task, {
          status: 'voided',
          closedAt: this.at,
          closeReason: reason,
        });
        await this.log(run, {
          kind: 'task.voided',
          stage,
          taskId: task.id,
          actorId,
          message: reason,
        });
      }
  }

  // ------------------------------------------------------ the run

  /** The run's own lifecycle, which every stage transition is fired on. */
  public get lifecycle(): string {
    return this.approval.lifecycle.name;
  }

  /** The run, still in the stay `task` belongs to; anything else is stale. */
  public async current(task: TaskRow): Promise<RunRow> {
    const run = await this.run(task.runId);
    if (!isOpenRun(run))
      throw new ApprovalError('STALE', 'This approval has ended.');
    if (
      run.status !== task.stage ||
      run.lifecycleVersion !== task.enteredVersion
    )
      throw new ApprovalError(
        'STALE',
        'The request has moved on since this task was given out.',
      );
    return run;
  }

  /** The business record a run decides. */
  public async record(run: RunRow): Promise<LifecycleRecord> {
    const record = await this.tx.read(run.lifecycle, run.recordId);
    if (!record)
      throw new Error(
        `${run.lifecycle} record "${run.recordId}" of approval run "${run.id}" is gone.`,
      );
    return record;
  }

  /** The record as it is under review: the changes the run holds applied. */
  public reviewed(record: LifecycleRecord, run: RunRow): LifecycleRecord {
    return { ...record, ...run.content };
  }

  // ------------------------------------------------------ the stage

  public definition(stage: string): StageDefinition<T> {
    return this.approval.stage(stage);
  }

  /**
   * After an answer: gives members their turn back once the gates in front
   * of them are answered, and opens the signers after a member who approved.
   */
  public async openGates(
    run: RunRow,
    stage: string,
    version: number,
  ): Promise<void> {
    const blocking = this.approval.options.consultations?.blocking === true;
    const stay = await this.stay(run, stage, version);
    for (const member of stay.filter((task) => task.role === 'member')) {
      const gates = stay.filter((gate) => gate.gates === member.id);
      if (
        member.status === 'blocked' &&
        !gates.some((gate) => holds(gate, blocking))
      )
        await this.change(member, { status: 'pending' });
      if (member.status === 'completed' && member.answer === 'approve')
        for (const gate of gates)
          if (gate.mode === 'after' && gate.status === 'waiting')
            await this.change(gate, { status: 'pending' });
    }
  }

  /**
   * Asks the stage's policy what the stay comes to, applies what it says,
   * and when it concludes, fires the stage's transition on the run in this
   * transaction at the version the stay began at: a stay that has already
   * ended refuses it, and everything written here rolls back with it.
   */
  public async settle(
    run: RunRow,
    stage: string,
    version: number,
    event: StageEvent,
    actor: LifecycleActor,
    extra: { readonly requestId?: string; readonly input?: JsonObject } = {},
  ): Promise<Settled> {
    await this.openGates(run, stage, version);
    const stay = await this.stay(run, stage, version);
    const definition = this.definition(stage);
    const decision: StageDecision = (
      definition.policy as unknown as {
        decide(context: {
          tasks: readonly PolicyTask[];
          options: unknown;
          event: StageEvent;
          settings: JsonObject;
        }): StageDecision;
      }
    ).decide({
      tasks: memberViews(stay),
      options: definition.options,
      event,
      settings: run.settings,
    });
    if (decision.kind === 'open') {
      const byId = new Map(stay.map((task) => [task.id, task]));
      const apply = async (
        ids: readonly string[] | undefined,
        status: TaskStatus,
      ): Promise<void> => {
        for (const id of ids ?? []) {
          const task = byId.get(id);
          if (task && task.status !== status && OPEN.includes(task.status))
            await this.change(task, {
              status,
              ...(status === 'claimed' ? {} : { claimedAt: null }),
            });
        }
      };
      await apply(decision.activate, 'pending');
      await apply(decision.suspend, 'suspended');
      await apply(decision.candidates, 'candidate');
      return { kind: 'open' };
    }
    const result = decision.result;
    const { exits } = this.approval.options;
    const outcome =
      result === 'approved'
        ? 'approve'
        : result === 'rejected'
          ? 'reject'
          : 'returnTo' in result
            ? 'return'
            : 'conclude';
    const to =
      result === 'approved'
        ? this.approval.next(stage, run)
        : result === 'rejected'
          ? 'rejected'
          : 'returnTo' in result
            ? result.returnTo === 'applicant'
              ? exits.returned === undefined
                ? undefined
                : 'returned'
              : result.returnTo
            : exits.others?.[result.exit] === undefined
              ? undefined
              : 'concluded';
    if (to === undefined)
      throw new Error(
        `Approval "${this.approval.name}" has no exit for ${JSON.stringify(result)}.`,
      );
    const transition = this.approval.transition(stage, outcome);
    const fired = await this.tx.fire(this.lifecycle, run.id, transition, {
      actor,
      input: {
        ...(extra.input ?? {}),
        to,
        ...('exit' in (typeof result === 'object' ? result : {})
          ? { exit: (result as { exit: string }).exit }
          : {}),
        ...(decision.data ? { result: decision.data } : {}),
      },
      expect: { version },
      ...(extra.requestId === undefined ? {} : { requestId: extra.requestId }),
    });
    return { kind: 'closed', transition, to, fired };
  }

  /** Moves the run past a stage that needs nobody, saying why. */
  public async skip(
    run: RunRow,
    stage: string,
    reason: string,
    to: string,
  ): Promise<FireResult> {
    await this.log(run, {
      kind: 'stage.skipped',
      stage,
      actorId: SYSTEM_ACTOR.id,
      message: reason,
    });
    return this.tx.fire(
      this.lifecycle,
      run.id,
      this.approval.transition(stage, 'approve'),
      {
        actor: SYSTEM_ACTOR,
        input: { to, skipped: reason },
      },
    );
  }

  /** Whether `person` can be given a task of this stay. */
  public eligible(
    person: string,
    applicantId: string,
    stay: readonly TaskRow[],
    qualification: string | undefined,
    override = false,
  ): void {
    if (person === applicantId)
      throw new ApprovalError(
        'APPLICANT_NOT_ELIGIBLE',
        'The applicant cannot decide their own request.',
      );
    if (!this.directory.isActive(person))
      throw new ApprovalError('INACTIVE', `${person} can no longer act.`);
    if (
      stay.some(
        (task) =>
          task.assigneeId === person &&
          task.kind === 'decide' &&
          OPEN.includes(task.status),
      )
    )
      throw new ApprovalError(
        'ALREADY_RESPONSIBLE',
        `${person} is already responsible on this stage.`,
      );
    if (
      qualification !== undefined &&
      !override &&
      !this.directory.hasRole(person, qualification)
    )
      throw new ApprovalError(
        'NOT_QUALIFIED',
        `${person} does not hold the "${qualification}" role this stage needs.`,
      );
  }

  public actionable(task: TaskRow): boolean {
    return ACTIONABLE.includes(task.status);
  }
}
