import {
  SYSTEM_ACTOR,
  type JsonObject,
  type LifecycleActor,
  type LifecycleRecord,
  type LifecycleRuntime,
  type LifecycleTransaction,
  type LifecycleTypes,
  type RecordId,
  type ServicesOf,
} from '@nocobase/lifecycle';

import { ApprovalError } from './errors.js';
import {
  ACTIONABLE,
  APPROVAL_COLLECTIONS,
  OPEN,
  freezeOf,
  hashOf,
  isOpenRun,
  toEvent,
  toRun,
  toTask,
  type AddMode,
  type EventRow,
  type RunRow,
  type TaskRow,
  type TaskStatus,
} from './model.js';
import { rowsOf } from './rows.js';
import type { Approval } from './types.js';
import type { PolicyTask } from './policies.js';
import { ApprovalWork, memberViews, type Settled } from './work.js';

type AnyApproval = Approval<LifecycleTypes>;

export type ServicesSource = object | ((handle: unknown) => object);

/** What an answer came to. */
export interface Answered {
  readonly task: TaskRow;
  /**
   * `open` while the stage goes on, `replayed` for a repeated request,
   * otherwise the transition its conclusion fired.
   */
  readonly outcome: string;
}

export interface RespondInput {
  readonly taskId: string;
  readonly actor: LifecycleActor;
  readonly answer: string;
  readonly comment?: string;
  readonly data?: JsonObject;
  /** The content the page showed; a decision on other content is refused. */
  readonly contentHash?: string;
  /** The same click sent twice is answered once. */
  readonly requestId?: string;
}

/** What one person may do on a task now: the buttons, and the services check the same rules. */
export interface TaskActions {
  readonly task: TaskRow;
  /** Whom the actor acts for, when it is a delegation. */
  readonly onBehalfOf: string | null;
  readonly actions: readonly string[];
}

export interface ReassignReport {
  readonly moved: readonly { readonly from: string; readonly to: string }[];
  readonly failed: readonly {
    readonly taskId: string;
    readonly reason: string;
  }[];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const { runs: RUNS, tasks: TASKS, events: EVENTS } = APPROVAL_COLLECTIONS;

/**
 * The approval layer's operations. Each runs in one transaction: it checks
 * the task is still open and its run still in the stay it belongs to, writes
 * the task, and — when the stage concludes — fires the run's transition in
 * the same transaction, which fires the business record's exit when the run
 * ends, so the conclusion, the run and the record move together or not at
 * all.
 */
export class ApprovalService {
  private readonly approvals = new Map<string, AnyApproval>();

  public constructor(
    private readonly runtime: LifecycleRuntime,
    approvals: readonly Approval<never>[],
    private readonly services: ServicesSource,
  ) {
    for (const approval of approvals)
      this.approvals.set(approval.name, approval as unknown as AnyApproval);
  }

  // ------------------------------------------------------------- plumbing

  private approval(name: string): AnyApproval {
    const approval = this.approvals.get(name);
    if (!approval) throw new Error(`No approval "${name}".`);
    return approval;
  }

  private servicesFor(handle: unknown): ServicesOf<LifecycleTypes> {
    return (
      typeof this.services === 'function'
        ? this.services(handle)
        : this.services
    ) as ServicesOf<LifecycleTypes>;
  }

  private work(
    approval: AnyApproval,
    tx: LifecycleTransaction,
  ): ApprovalWork<LifecycleTypes> {
    return new ApprovalWork(approval, tx, this.servicesFor(tx.handle), tx.now);
  }

  /** Runs `body` on a task in a transaction, with the work for its approval. */
  private onTask<R>(
    taskId: string,
    body: (
      w: ApprovalWork<LifecycleTypes>,
      task: TaskRow,
      tx: LifecycleTransaction,
    ) => Promise<R>,
  ): Promise<R> {
    return this.runtime.transaction(async (tx) => {
      const row = await rowsOf(tx.handle).get(TASKS, taskId);
      if (!row)
        throw new ApprovalError('TASK_NOT_FOUND', `No task "${taskId}".`);
      const task = toTask(row);
      return body(this.work(this.approval(task.source), tx), task, tx);
    });
  }

  private applicantOf(
    w: ApprovalWork<LifecycleTypes>,
    record: LifecycleRecord,
  ): string {
    return w.approval.options.applicant(record);
  }

  private refuseClosed(task: TaskRow, actorId: string): never {
    switch (task.status) {
      case 'completed':
        throw new ApprovalError(
          task.assigneeId === actorId ? 'ALREADY_ANSWERED' : 'TASK_CLOSED',
          task.assigneeId === actorId
            ? 'You have already answered this.'
            : 'This task has been answered.',
        );
      case 'voided':
      case 'transferred':
        throw new ApprovalError(
          'TASK_CLOSED',
          `This task is no longer open (${task.closeReason ?? task.status}).`,
        );
      case 'candidate':
        throw new ApprovalError(
          'CLAIM_FIRST',
          'Someone has to take this from the pool first.',
        );
      default:
        throw new ApprovalError('NOT_YOUR_TURN', 'It is not your turn yet.');
    }
  }

  /**
   * Whom the actor answers for: themselves, or the assignee whose delegation
   * reaches them now. Nobody acts on their own request through a
   * delegation, and someone who can no longer act answers nothing.
   */
  private actingFor(
    w: ApprovalWork<LifecycleTypes>,
    task: TaskRow,
    actor: LifecycleActor,
    applicantId: string,
  ): string | null {
    if (actor.system === true) return null;
    if (!w.directory.isActive(actor.id))
      throw new ApprovalError('INACTIVE', `${actor.id} can no longer act.`);
    if (task.assigneeId === actor.id) return null;
    if (task.kind === 'decide' && actor.id !== applicantId) {
      const delegation = w.directory.delegateOf?.(
        task.assigneeId,
        w.approval.kind,
        w.at,
        task.createdAt,
      );
      if (delegation?.to === actor.id) return task.assigneeId;
    }
    throw new ApprovalError(
      'NOT_ASSIGNEE',
      'This task is not waiting for your answer.',
    );
  }

  /** The task's run still in the stay, and the business record it decides; refuses anything stale. */
  private async stay(
    w: ApprovalWork<LifecycleTypes>,
    task: TaskRow,
  ): Promise<{ run: RunRow; record: LifecycleRecord }> {
    const run = await w.current(task);
    return { run, record: await w.record(run) };
  }

  private checkContent(
    w: ApprovalWork<LifecycleTypes>,
    run: RunRow,
    record: LifecycleRecord,
    shown: string | undefined,
  ): void {
    const freeze = w.approval.options.freeze ?? [];
    if (
      freeze.length &&
      hashOf(freezeOf(record, freeze)) !== hashOf(run.submitted)
    )
      throw new ApprovalError(
        'CONTENT_CHANGED',
        'The content changed after it was submitted; it cannot be decided as it is.',
      );
    if (shown !== undefined && shown !== run.contentHash)
      throw new ApprovalError(
        'STALE_CONTENT',
        'The page showed other content than what is under review; reload it.',
      );
  }

  private allowedAnswers(
    w: ApprovalWork<LifecycleTypes>,
    task: TaskRow,
  ): readonly string[] {
    switch (task.kind) {
      case 'consult':
        return ['opinion'];
      case 'material':
        return ['provided'];
      case 'copy':
        return ['read'];
      default: {
        const definition = w.definition(task.stage);
        const extra =
          task.role === 'member'
            ? ((
                definition.policy as unknown as {
                  answers?(options: unknown): readonly string[];
                }
              ).answers?.(definition.options) ?? [])
            : [];
        return ['approve', 'reject', ...extra];
      }
    }
  }

  // ------------------------------------------------------------- answers

  /**
   * Answers a task. An answer that leaves the stage open writes the task
   * alone; the record, its version and its clock do not move. The answer
   * that concludes it fires the stage's transition in the same transaction.
   */
  public respond(input: RespondInput): Promise<Answered> {
    return this.onTask(input.taskId, async (w, task) => {
      if (
        input.requestId !== undefined &&
        task.requestId === input.requestId &&
        task.status === 'completed'
      )
        return { task, outcome: 'replayed' };
      if (task.kind === 'copy') return this.read(w, task, input);
      const { run, answered, settleInput } = await this.answer(w, task, input);
      const settled = await w.settle(
        run,
        task.stage,
        task.enteredVersion,
        { kind: 'answered', taskId: task.id },
        input.actor,
        {
          ...(input.requestId === undefined
            ? {}
            : { requestId: input.requestId }),
          input: settleInput,
        },
      );
      return {
        task: answered,
        outcome: settled.kind === 'open' ? 'open' : settled.transition,
      };
    });
  }

  /**
   * Answers every task the actor holds on the record's current stay with the
   * same answer — a whole sheet decided at once — and settles the stage
   * once, in one transaction.
   */
  public respondAll(input: {
    readonly lifecycle: string;
    readonly recordId: RecordId;
    readonly actor: LifecycleActor;
    readonly answer: string;
    readonly comment?: string;
    readonly contentHash?: string;
  }): Promise<Answered[]> {
    return this.runtime.transaction(async (tx) => {
      const tasks = (
        await rowsOf(tx.handle).find(TASKS, {
          lifecycle: input.lifecycle,
          recordId: String(input.recordId),
          assigneeId: input.actor.id,
        })
      )
        .map(toTask)
        .filter(
          (task) =>
            ACTIONABLE.includes(task.status) &&
            task.kind === 'decide' &&
            task.role === 'member',
        );
      if (!tasks.length)
        throw new ApprovalError(
          'NOT_ASSIGNEE',
          'Nothing is waiting for you here.',
        );
      const answers: Answered[] = [];
      let last:
        | { w: ApprovalWork<LifecycleTypes>; run: RunRow; task: TaskRow }
        | undefined;
      for (const task of tasks) {
        const w = this.work(this.approval(task.source), tx);
        const { run, answered } = await this.answer(w, task, {
          taskId: task.id,
          actor: input.actor,
          answer: input.answer,
          ...(input.comment === undefined ? {} : { comment: input.comment }),
          ...(input.contentHash === undefined
            ? {}
            : { contentHash: input.contentHash }),
        });
        answers.push({ task: answered, outcome: 'open' });
        last = { w, run, task };
      }
      if (last) {
        const settled = await last.w.settle(
          last.run,
          last.task.stage,
          last.task.enteredVersion,
          { kind: 'answered', taskId: last.task.id },
          input.actor,
          { input: { answer: input.answer, tasks: tasks.length } },
        );
        if (settled.kind === 'closed')
          answers[answers.length - 1] = {
            ...answers[answers.length - 1],
            outcome: settled.transition,
          };
      }
      return answers;
    });
  }

  /** Checks and writes one answer; the caller settles the stage. */
  private async answer(
    w: ApprovalWork<LifecycleTypes>,
    task: TaskRow,
    input: RespondInput,
  ): Promise<{ run: RunRow; answered: TaskRow; settleInput: JsonObject }> {
    if (!w.actionable(task)) this.refuseClosed(task, input.actor.id);
    const { run, record } = await this.stay(w, task);
    const onBehalfOf = this.actingFor(
      w,
      task,
      input.actor,
      this.applicantOf(w, record),
    );
    this.checkContent(w, run, record, input.contentHash);
    if (!this.allowedAnswers(w, task).includes(input.answer))
      throw new ApprovalError(
        'INVALID_ANSWER',
        `Answer ${this.allowedAnswers(w, task).join(' or ')}.`,
      );
    // Material adds to a request; it does not change what is decided.
    const frozen = w.approval.options.freeze ?? [];
    if (
      task.kind === 'material' &&
      Object.keys(input.data ?? {}).some((field) => frozen.includes(field))
    )
      throw new ApprovalError(
        'INVALID_ANSWER',
        'Material cannot change the request; return it to change it.',
      );
    const comment = text(input.comment);
    if (
      input.answer === 'reject' &&
      !comment &&
      (w.approval.options.reasons ?? ['reject', 'return']).includes('reject')
    )
      throw new ApprovalError(
        'REASON_REQUIRED',
        'Give a reason for rejecting.',
      );
    if (input.answer === 'opinion' && !comment)
      throw new ApprovalError('REASON_REQUIRED', 'Write the opinion.');
    const definition = w.definition(task.stage);
    const problem =
      task.kind === 'decide' && task.role === 'member'
        ? ((
            definition.policy as unknown as {
              check?(context: {
                task: PolicyTask;
                answer: string;
                comment: string | null;
                data: JsonObject;
                options: unknown;
              }): string | null;
            }
          ).check?.({
            task: memberViews([task])[0],
            answer: input.answer,
            comment,
            data: input.data ?? {},
            options: definition.options,
          }) ?? null)
        : null;
    if (problem) throw new ApprovalError('INVALID_ANSWER', problem);
    const event = await w.log(run, {
      kind: 'task.answered',
      stage: task.stage,
      taskId: task.id,
      actorId: input.actor.id,
      message: comment,
      data: {
        answer: input.answer,
        ...(onBehalfOf ? { onBehalfOf } : {}),
      },
    });
    const answered = await w.change(task, {
      status: 'completed',
      answer: input.answer,
      comment,
      data:
        task.data === null && input.data === undefined
          ? null
          : { ...(task.data ?? {}), ...(input.data ?? {}) },
      actorId: input.actor.id,
      contentHash: run.contentHash,
      requestId: input.requestId ?? null,
      closedAt: w.at,
      seq: Number(event.id),
    });
    return {
      run,
      answered,
      settleInput: {
        taskId: task.id,
        answer: input.answer,
        ...(comment ? { comment } : {}),
        ...(onBehalfOf ? { onBehalfOf } : {}),
        ...(input.data ? { data: input.data } : {}),
      },
    };
  }

  /** A copy is read by its recipient; reading decides nothing. */
  private async read(
    w: ApprovalWork<LifecycleTypes>,
    task: TaskRow,
    input: RespondInput,
  ): Promise<Answered> {
    if (task.assigneeId !== input.actor.id)
      throw new ApprovalError('NOT_ASSIGNEE', 'This copy is not yours.');
    if (input.answer !== 'read')
      throw new ApprovalError(
        'INVALID_ANSWER',
        'A copy is read; it decides nothing.',
      );
    if (task.status !== 'pending') return { task, outcome: 'replayed' };
    const read = await w.change(task, {
      status: 'completed',
      answer: 'read',
      actorId: input.actor.id,
      closedAt: w.at,
    });
    return { task: read, outcome: 'open' };
  }

  // ------------------------------------------------------------- pools

  /** Takes a pool task: the others are suspended until it is released. */
  public claim(input: {
    readonly taskId: string;
    readonly actor: LifecycleActor;
  }): Promise<TaskRow> {
    return this.onTask(input.taskId, async (w, task) => {
      const definition = w.definition(task.stage);
      if (definition.policy.kind !== 'claimable')
        throw new ApprovalError('NOT_ALLOWED', 'This stage has no pool.');
      if (task.status !== 'candidate' && task.status !== 'pending')
        this.refuseClosed(task, input.actor.id);
      const { run, record } = await this.stay(w, task);
      if (this.actingFor(w, task, input.actor, this.applicantOf(w, record)))
        throw new ApprovalError(
          'NOT_ASSIGNEE',
          'Take your own place in the pool.',
        );
      return this.take(w, run, task, input.actor, 'task.claimed');
    });
  }

  private async take(
    w: ApprovalWork<LifecycleTypes>,
    run: RunRow,
    task: TaskRow,
    actor: LifecycleActor,
    kind: string,
  ): Promise<TaskRow> {
    const definition = w.definition(task.stage);
    const claimed = await w.change(task, {
      status: 'claimed',
      claimedAt: w.at,
      dueAt:
        definition.claimTimeoutHours === undefined
          ? null
          : new Date(
              w.now.getTime() + definition.claimTimeoutHours * 3_600_000,
            ).toISOString(),
    });
    await w.log(run, {
      kind,
      stage: task.stage,
      taskId: task.id,
      actorId: actor.id,
      data: { assigneeId: task.assigneeId },
    });
    await w.settle(
      run,
      task.stage,
      task.enteredVersion,
      { kind: 'claimed', taskId: task.id },
      actor,
    );
    return claimed;
  }

  /** Puts a taken task back in the pool: the taker, a supervisor, or the system on a timeout. */
  public release(input: {
    readonly taskId: string;
    readonly actor: LifecycleActor;
  }): Promise<TaskRow> {
    return this.onTask(input.taskId, async (w, task) => {
      if (task.status !== 'claimed') this.refuseClosed(task, input.actor.id);
      const { run } = await this.stay(w, task);
      const supervisor = w.approval.options.supervisorRole;
      if (
        input.actor.system !== true &&
        input.actor.id !== task.assigneeId &&
        !(supervisor && w.directory.hasRole(input.actor.id, supervisor))
      )
        throw new ApprovalError('NOT_ASSIGNEE', 'Only its taker puts it back.');
      const definition = w.definition(task.stage);
      const mustClaim = (definition.options as { readonly mustClaim?: boolean })
        .mustClaim;
      const released = await w.change(task, {
        status: mustClaim ? 'candidate' : 'pending',
        claimedAt: null,
        dueAt: null,
      });
      await w.log(run, {
        kind: 'task.released',
        stage: task.stage,
        taskId: task.id,
        actorId: input.actor.id,
      });
      await w.settle(
        run,
        task.stage,
        task.enteredVersion,
        { kind: 'released', taskId: task.id },
        input.actor,
      );
      return released;
    });
  }

  /** A supervisor gives a pool to one of its candidates. */
  public assign(input: {
    readonly taskId: string;
    readonly to: string;
    readonly actor: LifecycleActor;
  }): Promise<TaskRow> {
    return this.onTask(input.taskId, async (w, task) => {
      const supervisor = w.approval.options.supervisorRole;
      if (!supervisor || !w.directory.hasRole(input.actor.id, supervisor))
        throw new ApprovalError(
          'NOT_ALLOWED',
          'Only a supervisor assigns a pool.',
        );
      const { run } = await this.stay(w, task);
      const place = (await w.stay(run, task.stage, task.enteredVersion)).find(
        (each) =>
          each.assigneeId === input.to &&
          (each.status === 'candidate' || each.status === 'pending'),
      );
      if (!place || !w.directory.isActive(input.to))
        throw new ApprovalError(
          'NOT_IN_POOL',
          `${input.to} is not an active member of this pool.`,
        );
      return this.take(w, run, place, input.actor, 'task.assigned');
    });
  }

  // ------------------------------------------------------- responsibility

  /**
   * Hands a task to someone else: the old row closes as transferred and a
   * new one takes its place, its turn, its gates and its deadline. The
   * record does not move, so neither does its clock.
   */
  public transfer(input: {
    readonly taskId: string;
    readonly actor: LifecycleActor;
    readonly to: string;
    readonly reason: string;
    /** `reassign` when an administrator moves it, `escalate` for the sweep. */
    readonly via?: 'transfer' | 'reassign' | 'escalate';
    /** An administrator's explained override of the stage's qualification. */
    readonly override?: boolean;
  }): Promise<TaskRow> {
    return this.onTask(input.taskId, async (w, task) =>
      this.handOver(w, task, input),
    );
  }

  private async handOver(
    w: ApprovalWork<LifecycleTypes>,
    task: TaskRow,
    input: {
      readonly actor: LifecycleActor;
      readonly to: string;
      readonly reason: string;
      readonly via?: 'transfer' | 'reassign' | 'escalate';
      readonly override?: boolean;
    },
  ): Promise<TaskRow> {
    const via = input.via ?? 'transfer';
    if (!OPEN.includes(task.status)) this.refuseClosed(task, input.actor.id);
    if (task.kind === 'copy')
      throw new ApprovalError('NOT_ALLOWED', 'A copy is not handed over.');
    const { run, record } = await this.stay(w, task);
    const definition = w.definition(task.stage);
    if (via === 'transfer') {
      if (definition.transfer === false)
        throw new ApprovalError(
          'NOT_ALLOWED',
          'This stage is not handed over.',
        );
      if (input.actor.id !== task.assigneeId)
        throw new ApprovalError(
          'NOT_ASSIGNEE',
          'Only the person responsible hands it over; a delegate decides but does not.',
        );
      if (!w.directory.isActive(input.actor.id))
        throw new ApprovalError(
          'INACTIVE',
          `${input.actor.id} can no longer act.`,
        );
    }
    if (via === 'reassign') {
      const admin = w.approval.options.adminRole;
      if (!admin || !w.directory.hasRole(input.actor.id, admin))
        throw new ApprovalError(
          'NOT_ALLOWED',
          'Only an administrator reassigns.',
        );
      if (input.override && !text(input.reason))
        throw new ApprovalError(
          'REASON_REQUIRED',
          'Explain why the qualification is overridden.',
        );
    }
    if (!text(input.reason))
      throw new ApprovalError('REASON_REQUIRED', 'Say why it is handed over.');
    const stay = await w.stay(run, task.stage, task.enteredVersion);
    w.eligible(
      input.to,
      this.applicantOf(w, record),
      stay.filter((each) => each.id !== task.id),
      task.role === 'member' ? definition.qualification : undefined,
      input.override === true,
    );
    await w.change(task, {
      status: 'transferred',
      closedAt: w.at,
      closeReason: input.reason,
    });
    const note =
      via === 'reassign'
        ? `Reassigned by ${input.actor.id}: ${input.reason}${input.override ? ' (qualification overridden)' : ''}`
        : via === 'escalate'
          ? `Escalated: ${input.reason}`
          : input.reason;
    const next = await w.addTask({
      lifecycle: task.lifecycle,
      recordId: task.recordId,
      runId: task.runId,
      stage: task.stage,
      enteredVersion: task.enteredVersion,
      assigneeId: input.to,
      kind: task.kind,
      role: task.role,
      mode: task.mode,
      gates: task.gates,
      depth: task.depth,
      order: task.order,
      subject: task.subject,
      via,
      note,
      previousTaskId: task.id,
      status: task.status,
      claimedAt: task.status === 'claimed' ? w.at : null,
      // An escalation is the last step; a transfer keeps both clocks.
      remindAt: via === 'escalate' ? null : task.remindAt,
      dueAt: via === 'escalate' ? null : task.dueAt,
    });
    for (const gate of stay)
      if (gate.gates === task.id && OPEN.includes(gate.status))
        await w.change(gate, { gates: next.id });
    await w.log(run, {
      kind: 'task.transferred',
      stage: task.stage,
      taskId: next.id,
      actorId: input.actor.id,
      message: note,
      data: {
        from: task.assigneeId,
        to: input.to,
        via,
        previousTaskId: task.id,
      },
    });
    return next;
  }

  /**
   * Moves every open task of `from` to `to`, one transaction each, and says
   * what could not move and why. The right to reassign is not the right to
   * decide: the administrator answers nothing.
   */
  public async reassign(input: {
    readonly from: string;
    readonly to: string;
    readonly actor: LifecycleActor;
    readonly reason: string;
    readonly override?: boolean;
  }): Promise<ReassignReport> {
    const open = await this.tasksOf(input.from, OPEN);
    const moved: { from: string; to: string }[] = [];
    const failed: { taskId: string; reason: string }[] = [];
    for (const task of open)
      try {
        const next = await this.transfer({
          taskId: task.id,
          actor: input.actor,
          to: input.to,
          reason: input.reason,
          via: 'reassign',
          ...(input.override === undefined ? {} : { override: input.override }),
        });
        moved.push({ from: task.id, to: next.id });
      } catch (error) {
        failed.push({
          taskId: task.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    return { moved, failed };
  }

  /** Invites a signer before, after or alongside the actor's own decision. */
  public addSigner(input: {
    readonly taskId: string;
    readonly actor: LifecycleActor;
    readonly person: string;
    readonly mode: AddMode;
  }): Promise<TaskRow> {
    return this.onTask(input.taskId, async (w, task) => {
      const signers = w.approval.options.signers;
      if (!signers?.modes.includes(input.mode))
        throw new ApprovalError(
          'NOT_ALLOWED',
          `This approval takes no signer ${input.mode}.`,
        );
      if (!w.actionable(task) || task.kind !== 'decide')
        this.refuseClosed(task, input.actor.id);
      if (task.depth >= (signers.maxDepth ?? 1))
        throw new ApprovalError(
          'NOT_ALLOWED',
          'An added signer may not add another.',
        );
      const { run, record } = await this.stay(w, task);
      if (input.actor.id !== task.assigneeId)
        throw new ApprovalError(
          'NOT_ASSIGNEE',
          'Only the person responsible adds a signer.',
        );
      const stay = await w.stay(run, task.stage, task.enteredVersion);
      w.eligible(input.person, this.applicantOf(w, record), stay, undefined);
      const member =
        task.role === 'member'
          ? task
          : (stay.find((each) => each.id === task.gates) ?? task);
      const added = await w.addTask({
        lifecycle: task.lifecycle,
        recordId: task.recordId,
        runId: task.runId,
        stage: task.stage,
        enteredVersion: task.enteredVersion,
        assigneeId: input.person,
        role: input.mode === 'alongside' ? 'member' : 'gate',
        mode: input.mode,
        gates: input.mode === 'alongside' ? null : member.id,
        depth: task.depth + 1,
        order: task.order,
        via: 'addSigner',
        note: `Added ${input.mode} by ${input.actor.id}.`,
        status: input.mode === 'after' ? 'waiting' : 'pending',
      });
      if (input.mode === 'before')
        await w.change(member, { status: 'blocked' });
      await w.log(run, {
        kind: 'task.added',
        stage: task.stage,
        taskId: added.id,
        actorId: input.actor.id,
        data: { assigneeId: input.person, mode: input.mode, for: member.id },
      });
      return added;
    });
  }

  /** Asks someone's opinion: it decides nothing, and holds the asker if the approval says so. */
  public consult(input: {
    readonly taskId: string;
    readonly actor: LifecycleActor;
    readonly person: string;
    readonly question: string;
  }): Promise<TaskRow> {
    return this.onTask(input.taskId, async (w, task) => {
      const consultations = w.approval.options.consultations;
      if (!consultations)
        throw new ApprovalError(
          'NOT_ALLOWED',
          'This approval takes no consultations.',
        );
      return this.gate(w, task, input.actor, {
        kind: 'consult',
        assigneeId: input.person,
        note: input.question,
        hold: consultations.blocking,
      });
    });
  }

  /** Asks the applicant for material without returning the request. */
  public askMaterial(input: {
    readonly taskId: string;
    readonly actor: LifecycleActor;
    readonly request: string;
  }): Promise<TaskRow> {
    return this.onTask(input.taskId, async (w, task) => {
      if (!w.approval.options.materials)
        throw new ApprovalError(
          'NOT_ALLOWED',
          'This approval asks for no material.',
        );
      const { record } = await this.stay(w, task);
      return this.gate(w, task, input.actor, {
        kind: 'material',
        assigneeId: this.applicantOf(w, record),
        note: input.request,
        hold: true,
      });
    });
  }

  private async gate(
    w: ApprovalWork<LifecycleTypes>,
    task: TaskRow,
    actor: LifecycleActor,
    gate: {
      readonly kind: 'consult' | 'material';
      readonly assigneeId: string;
      readonly note: string;
      readonly hold: boolean;
    },
  ): Promise<TaskRow> {
    if (!w.actionable(task) || task.role !== 'member')
      this.refuseClosed(task, actor.id);
    if (actor.id !== task.assigneeId)
      throw new ApprovalError(
        'NOT_ASSIGNEE',
        'Only the person responsible asks.',
      );
    if (!text(gate.note))
      throw new ApprovalError('REASON_REQUIRED', 'Say what is asked.');
    const { run } = await this.stay(w, task);
    if (gate.kind === 'consult' && !w.directory.isActive(gate.assigneeId))
      throw new ApprovalError(
        'INACTIVE',
        `${gate.assigneeId} can no longer act.`,
      );
    const added = await w.addTask({
      lifecycle: task.lifecycle,
      recordId: task.recordId,
      runId: task.runId,
      stage: task.stage,
      enteredVersion: task.enteredVersion,
      assigneeId: gate.assigneeId,
      kind: gate.kind,
      role: 'gate',
      gates: task.id,
      depth: task.depth + 1,
      via: gate.kind,
      note: gate.note,
    });
    if (gate.hold) await w.change(task, { status: 'blocked' });
    await w.log(run, {
      kind:
        gate.kind === 'consult' ? 'task.consulted' : 'task.materialRequested',
      stage: task.stage,
      taskId: added.id,
      actorId: actor.id,
      message: gate.note,
      data: { assigneeId: gate.assigneeId, for: task.id },
    });
    return added;
  }

  // ------------------------------------------------------- returns

  /**
   * Returns the request to an earlier stage or to the applicant. The task
   * closes with the return as its answer; the run moves in the same
   * transaction, and its leave hook ends everything else of the stay. A
   * return to the applicant ends the run, which fires the business's
   * return exit.
   */
  public returnTo(input: {
    readonly taskId: string;
    readonly actor: LifecycleActor;
    /** A stage, or `applicant`. */
    readonly to: string;
    readonly reason: string;
    /** Come straight back to this stage once it is decided again. */
    readonly resume?: boolean;
    readonly requestId?: string;
  }): Promise<Answered> {
    return this.onTask(input.taskId, async (w, task) => {
      if (!w.actionable(task) || task.kind !== 'decide')
        this.refuseClosed(task, input.actor.id);
      const { run, record } = await this.stay(w, task);
      this.actingFor(w, task, input.actor, this.applicantOf(w, record));
      const { options } = w.approval;
      const target =
        input.to === 'applicant'
          ? options.exits.returned === undefined
            ? undefined
            : 'returned'
          : input.to;
      const stages = w.approval.flow;
      const valid =
        input.to === 'applicant'
          ? target !== undefined
          : options.returns?.earlier === true &&
            stages.includes(input.to) &&
            stages.indexOf(input.to) < stages.indexOf(task.stage) &&
            run.plan.some(
              (entry) => entry.stage === input.to && entry.included,
            );
      if (!valid || target === undefined)
        throw new ApprovalError(
          'INVALID_TARGET',
          'Return to the applicant or to an earlier stage of this request.',
        );
      if (input.resume && !options.returns?.resume)
        throw new ApprovalError(
          'NOT_ALLOWED',
          'This approval does not come straight back.',
        );
      const reason = text(input.reason);
      if (
        !reason &&
        (options.reasons ?? ['reject', 'return']).includes('return')
      )
        throw new ApprovalError('REASON_REQUIRED', 'Say why it is returned.');
      const event = await w.log(run, {
        kind: 'task.answered',
        stage: task.stage,
        taskId: task.id,
        actorId: input.actor.id,
        message: reason,
        data: { answer: 'return', to: input.to },
      });
      const answered = await w.change(task, {
        status: 'completed',
        answer: 'return',
        comment: reason,
        actorId: input.actor.id,
        requestId: input.requestId ?? null,
        closedAt: w.at,
        seq: Number(event.id),
      });
      const transition = w.approval.transition(task.stage, 'return');
      await w.tx.fire(w.lifecycle, run.id, transition, {
        actor: input.actor,
        input: {
          to: target,
          taskId: task.id,
          ...(reason ? { reason } : {}),
          resume: input.resume === true,
        },
        expect: { version: task.enteredVersion },
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
      });
      return { task: answered, outcome: transition };
    });
  }

  /**
   * Proposes a change to fields the stage may revise. The change is the
   * run's: the content under review changes and the business record does
   * not until the run ends. An earlier approval that covered a changed field
   * no longer holds, so the request goes back to the earliest such stage;
   * otherwise the stage decides again on the new content.
   */
  public revise(input: {
    readonly taskId: string;
    readonly actor: LifecycleActor;
    readonly values: JsonObject;
    readonly reason: string;
  }): Promise<Answered> {
    return this.onTask(input.taskId, async (w, task) => {
      if (!w.actionable(task) || task.role !== 'member')
        this.refuseClosed(task, input.actor.id);
      const { run } = await this.stay(w, task);
      if (input.actor.id !== task.assigneeId)
        throw new ApprovalError(
          'NOT_ASSIGNEE',
          'Only the person responsible revises.',
        );
      const definition = w.definition(task.stage);
      const allowed = definition.canRevise ?? [];
      const fields = Object.keys(input.values);
      if (!fields.length || fields.some((field) => !allowed.includes(field)))
        throw new ApprovalError(
          'NOT_ALLOWED',
          allowed.length
            ? `This stage may revise ${allowed.join(', ')} only.`
            : 'This stage may not change the content.',
        );
      if (!text(input.reason))
        throw new ApprovalError('REASON_REQUIRED', 'Say why it is revised.');
      const changed = fields.filter(
        (field) =>
          hashOf({ v: input.values[field] ?? null }) !==
          hashOf({ v: run.content[field] ?? null }),
      );
      const stages = w.approval.flow;
      let target: string = task.stage;
      for (const earlier of stages.slice(0, stages.indexOf(task.stage))) {
        const covers =
          w.approval.stage(earlier).covers ?? w.approval.options.freeze ?? [];
        if (
          covers.some((field) => changed.includes(field)) &&
          (await w.concluded(run, earlier)) === 'approved'
        ) {
          target = earlier;
          break;
        }
      }
      const transition = w.approval.transition(task.stage, 'revise');
      await w.tx.fire(w.lifecycle, run.id, transition, {
        actor: input.actor,
        input: {
          to: target,
          taskId: task.id,
          values: input.values,
          reason: input.reason,
        },
        expect: { version: task.enteredVersion },
      });
      return { task, outcome: transition };
    });
  }

  // ------------------------------------------------------- administration

  /**
   * Moves an open run to another rule version, explicitly and on record. The
   * new plan keeps every stage already approved in the run; the request
   * waits at the first stage the new plan still needs, which may mean
   * moving it there.
   */
  public migrate(input: {
    readonly approval: string;
    readonly lifecycle: string;
    readonly recordId: RecordId;
    readonly version: number;
    readonly actor: LifecycleActor;
    readonly reason: string;
  }): Promise<RunRow> {
    return this.runtime.transaction(async (tx) => {
      const w = this.work(this.approval(input.approval), tx);
      const admin = w.approval.options.adminRole;
      if (!admin || !w.directory.hasRole(input.actor.id, admin))
        throw new ApprovalError(
          'NOT_ALLOWED',
          'Only an administrator migrates.',
        );
      if (!text(input.reason))
        throw new ApprovalError('REASON_REQUIRED', 'Say why it is migrated.');
      const run = await w.openRun(input.lifecycle, String(input.recordId));
      const record = await tx.read(input.lifecycle, input.recordId);
      if (!run || !record)
        throw new ApprovalError(
          'STALE',
          'This request has no approval in progress.',
        );
      const plan = w.approval.plan({
        record: w.reviewed(record, run),
        parameters: this.runtime.parameters(input.lifecycle) as never,
        version: input.version,
      });
      const kept: string[] = [];
      let target: string | undefined;
      for (const entry of plan.filter((each) => each.included)) {
        if ((await w.concluded(run, entry.stage)) === 'approved') {
          kept.push(entry.stage);
          continue;
        }
        target = entry.stage;
        break;
      }
      if (target === undefined)
        throw new ApprovalError(
          'INVALID_TARGET',
          `Under rule version ${input.version} nothing is left to decide; approve it instead.`,
        );
      const at = run.status;
      if (target !== at && !w.approval.options.migrations)
        throw new ApprovalError(
          'NOT_ALLOWED',
          `Rule version ${input.version} needs "${target}" first, and this approval does not move requests between stages.`,
        );
      const migrated = await w.changeRun(run, {
        version: input.version,
        plan: plan.map((entry) => ({ ...entry, people: null })),
      });
      await w.log(migrated, {
        kind: 'run.migrated',
        stage: at,
        actorId: input.actor.id,
        message: input.reason,
        data: { from: run.version, to: input.version, kept, waitsAt: target },
      });
      for (const stage of kept)
        await w.log(migrated, {
          kind: 'stage.note',
          stage,
          actorId: input.actor.id,
          message: `Kept when moved to rule version ${input.version}.`,
        });
      if (target !== at)
        await tx.fire(
          w.lifecycle,
          run.id,
          w.approval.transition(at, 'migrate'),
          {
            actor: input.actor,
            input: { to: target, version: input.version, reason: input.reason },
          },
        );
      return w.run(run.id);
    });
  }

  /**
   * Gives a stage that nobody qualified for a person to decide it: an
   * administrator's explained appointment. It decides nothing itself.
   */
  public appoint(input: {
    readonly approval: string;
    readonly lifecycle: string;
    readonly recordId: RecordId;
    readonly to: string;
    readonly actor: LifecycleActor;
    readonly reason: string;
  }): Promise<TaskRow> {
    return this.runtime.transaction(async (tx) => {
      const w = this.work(this.approval(input.approval), tx);
      const admin = w.approval.options.adminRole;
      if (!admin || !w.directory.hasRole(input.actor.id, admin))
        throw new ApprovalError(
          'NOT_ALLOWED',
          'Only an administrator appoints.',
        );
      if (!text(input.reason))
        throw new ApprovalError('REASON_REQUIRED', 'Say why.');
      const run = await w.openRun(input.lifecycle, String(input.recordId));
      const record = await tx.read(input.lifecycle, input.recordId);
      if (!run || !record)
        throw new ApprovalError(
          'STALE',
          'This request has no approval in progress.',
        );
      const stage = run.status;
      const version = run.lifecycleVersion;
      const stay = await w.stay(run, stage, version);
      if (stay.some((task) => OPEN.includes(task.status)))
        throw new ApprovalError(
          'NOT_ALLOWED',
          'This stage has people; reassign one of them instead.',
        );
      w.eligible(
        input.to,
        w.approval.options.applicant(record),
        stay,
        w.definition(stage).qualification,
      );
      const task = await w.addTask({
        lifecycle: input.lifecycle,
        recordId: String(input.recordId),
        runId: run.id,
        stage,
        enteredVersion: version,
        assigneeId: input.to,
        via: 'assign',
        note: `Appointed by ${input.actor.id}: ${input.reason}`,
      });
      await w.log(run, {
        kind: 'task.assigned',
        stage,
        taskId: task.id,
        actorId: input.actor.id,
        message: input.reason,
        data: { assigneeId: input.to, via: 'assign' },
      });
      return task;
    });
  }

  /**
   * Acts on tasks past their due time: an idle answer goes to the
   * assignee's manager, a claim nobody acted on goes back to the pool. Run
   * it on the same schedule as the lifecycle's triggers. Returns how many
   * tasks it moved.
   */
  public async sweep(): Promise<number> {
    const { due, reminders } = await this.runtime.transaction(async (tx) => {
      const at = tx.now.toISOString();
      const tasks = (await rowsOf(tx.handle).find(TASKS, {}))
        .map(toTask)
        .filter(
          (task) =>
            this.approvals.has(task.source) &&
            (task.status === 'pending' || task.status === 'claimed'),
        );
      return {
        due: tasks.filter((task) => task.dueAt !== null && task.dueAt <= at),
        reminders: tasks.filter(
          (task) =>
            task.remindAt !== null &&
            task.remindAt <= at &&
            (task.dueAt === null || task.dueAt > at),
        ),
      };
    });
    let moved = 0;
    for (const task of reminders)
      await this.onTask(task.id, async (w, current) => {
        if (current.remindAt === null || current.status !== task.status) return;
        await w.change(current, { remindAt: null });
        const notify = w.approval.options.notify;
        const services = w.services;
        if (notify)
          w.tx.afterCommit(() =>
            notify({ task: current, services, reason: 'reminder' }),
          );
        moved += 1;
      });
    for (const task of due)
      try {
        if (task.status === 'claimed') {
          await this.release({ taskId: task.id, actor: SYSTEM_ACTOR });
          moved += 1;
          continue;
        }
        await this.onTask(task.id, async (w, current) => {
          const manager = w.directory.managerOf(current.assigneeId);
          if (manager === undefined) return;
          await this.handOver(w, current, {
            actor: SYSTEM_ACTOR,
            to: manager,
            reason: `${current.assigneeId} did not answer in time`,
            via: 'escalate',
          });
          moved += 1;
        });
      } catch (error) {
        // Answered or moved meanwhile: nothing left to do for this task.
        if (!(error instanceof ApprovalError)) throw error;
      }
    return moved;
  }

  // ------------------------------------------------------------- reading

  /** Tasks held by a person, oldest first: a to-do list read from the task table alone. */
  public tasksOf(
    person: string,
    statuses: readonly TaskStatus[] = ['pending', 'claimed', 'candidate'],
    page: { readonly limit?: number; readonly offset?: number } = {},
  ): Promise<TaskRow[]> {
    return this.runtime.transaction(async (tx) => {
      const rows = await rowsOf(tx.handle).find(TASKS, { assigneeId: person });
      const tasks = rows
        .map(toTask)
        .filter(
          (task) =>
            this.approvals.has(task.source) && statuses.includes(task.status),
        )
        .sort((a, b) =>
          a.createdAt === b.createdAt
            ? Number(a.id) - Number(b.id)
            : a.createdAt < b.createdAt
              ? -1
              : 1,
        );
      const offset = page.offset ?? 0;
      return tasks.slice(
        offset,
        page.limit === undefined ? undefined : offset + page.limit,
      );
    });
  }

  /** Every task of a record, oldest first. */
  public tasksFor(lifecycle: string, recordId: RecordId): Promise<TaskRow[]> {
    return this.runtime.transaction(async (tx) =>
      (
        await rowsOf(tx.handle).find(TASKS, {
          lifecycle,
          recordId: String(recordId),
        })
      ).map(toTask),
    );
  }

  public runsFor(lifecycle: string, recordId: RecordId): Promise<RunRow[]> {
    return this.runtime.transaction(async (tx) =>
      (
        await rowsOf(tx.handle).find(RUNS, {
          lifecycle,
          recordId: String(recordId),
        })
      ).map(toRun),
    );
  }

  public eventsFor(lifecycle: string, recordId: RecordId): Promise<EventRow[]> {
    return this.runtime.transaction(async (tx) =>
      (
        await rowsOf(tx.handle).find(EVENTS, {
          lifecycle,
          recordId: String(recordId),
        })
      ).map(toEvent),
    );
  }

  /**
   * What `actor` may do on a record now, task by task: what a page shows as
   * buttons. Each action is refused by its service for the same reasons.
   */
  public actionsFor(
    lifecycle: string,
    recordId: RecordId,
    actor: LifecycleActor,
  ): Promise<TaskActions[]> {
    return this.runtime.transaction(async (tx) => {
      const tasks = (
        await rowsOf(tx.handle).find(TASKS, {
          lifecycle,
          recordId: String(recordId),
        })
      )
        .map(toTask)
        .filter((task) => OPEN.includes(task.status));
      const record = await tx.read(lifecycle, recordId);
      const result: TaskActions[] = [];
      if (!record) return result;
      for (const task of tasks) {
        const approval = this.approvals.get(task.source);
        if (!approval) continue;
        const w = this.work(approval, tx);
        const run = await w.run(task.runId);
        if (
          !isOpenRun(run) ||
          run.status !== task.stage ||
          run.lifecycleVersion !== task.enteredVersion
        )
          continue;
        let onBehalfOf: string | null;
        try {
          onBehalfOf = this.actingFor(
            w,
            task,
            actor,
            approval.options.applicant(record),
          );
        } catch {
          continue;
        }
        const definition = w.definition(task.stage);
        const own = onBehalfOf === null;
        const actions: string[] = [];
        if (
          task.status === 'candidate' ||
          (task.status === 'pending' && definition.policy.kind === 'claimable')
        )
          if (own) actions.push('claim');
        if (task.status === 'claimed' && own) actions.push('release');
        if (ACTIONABLE.includes(task.status)) {
          actions.push('respond');
          if (task.kind === 'decide') {
            const { options } = approval;
            if (options.returns?.earlier || options.exits.returned)
              actions.push('returnTo');
            if (own && definition.transfer !== false) actions.push('transfer');
            if (
              own &&
              options.signers?.modes.length &&
              task.depth < (options.signers.maxDepth ?? 1)
            )
              actions.push('addSigner');
            if (own && task.role === 'member' && options.consultations)
              actions.push('consult');
            if (own && task.role === 'member' && options.materials)
              actions.push('askMaterial');
            if (own && task.role === 'member' && definition.canRevise?.length)
              actions.push('revise');
          }
        }
        if (actions.length) result.push({ task, onBehalfOf, actions });
      }
      return result;
    });
  }
}

export type { Settled };
