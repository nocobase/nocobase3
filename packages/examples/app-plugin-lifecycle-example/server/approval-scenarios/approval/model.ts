import { createHash } from 'node:crypto';

import type { JsonObject, JsonValue } from '@nocobase/lifecycle';

import type {
  ApprovalStageRow,
  ApprovalTaskRow,
  AssignedVia,
  Resolver,
  StageRule,
} from '../../../shared/approval-trail.js';
import type { OrgDirectory } from '../org.js';
import type { ApprovalWork } from './records.js';
import type { ApprovalPolicy, StagePlan } from './policy.js';

export type {
  ApprovalStageRow,
  ApprovalTaskRow,
  AssignedVia,
  Decision,
} from '../../../shared/approval-trail.js';

export function stableJson(value: unknown): string {
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

/** The hash of the content, or of the fields a stage covers. */
export function contentHash(
  content: JsonObject,
  fields: readonly string[] | null = null,
): string {
  const covered: Record<string, JsonValue> = {};
  for (const key of fields ?? Object.keys(content))
    covered[key] = content[key] ?? null;
  return createHash('sha256')
    .update(stableJson(covered))
    .digest('hex')
    .slice(0, 16);
}

/** A stage row's plan fields, as a new round or an added signer starts it. */
export function stageFromPlan(
  plan: StagePlan,
  round: number,
  position: number,
): Omit<ApprovalStageRow, 'id' | 'requestId' | 'seq'> {
  return {
    round,
    position,
    key: plan.key,
    title: plan.title,
    rule: plan.rule,
    resolver: plan.resolver,
    fields: plan.fields ? [...plan.fields] : null,
    resolveAt: plan.resolveAt ?? 'enter',
    canRevise: plan.canRevise === true,
    escalate: plan.escalate === true,
    qualification: plan.qualification ?? null,
    because: plan.because ?? null,
    status: 'pending',
    resolvedAt: null,
    basis: null,
    keptFrom: null,
  };
}

export interface ResolveContext {
  readonly org: OrgDirectory;
  readonly applicantId: string;
  readonly now: string;
}

function managerChain(
  org: OrgDirectory,
  person: string,
  levels: number,
  notes: string[],
): string | undefined {
  let current: string | undefined = person;
  for (let level = 0; level < levels && current !== undefined; level += 1) {
    let next = org.managerOf(current);
    // A departed manager is passed over for the next one up, and it is said.
    while (next !== undefined && !org.isActive(next)) {
      notes.push(`Manager ${next} is inactive; passed to the next level.`);
      next = org.managerOf(next);
    }
    current = next;
  }
  return current;
}

function candidatesOf(
  resolver: Resolver,
  context: ResolveContext,
  notes: string[],
): string[] {
  const { org, applicantId } = context;
  switch (resolver.kind) {
    case 'people': {
      const active = resolver.people.filter((person) => org.isActive(person));
      for (const person of resolver.people)
        if (!active.includes(person))
          notes.push(`${person} is inactive and was not assigned.`);
      return active;
    }
    case 'manager': {
      const manager = managerChain(
        org,
        applicantId,
        resolver.levels ?? 1,
        notes,
      );
      return manager === undefined ? [] : [manager];
    }
    case 'role': {
      if (resolver.all)
        return org
          .holders(resolver.role)
          .filter((person) => org.isActive(person));
      const holder = org.holderOf(resolver.role);
      return holder === undefined ? [] : [holder];
    }
  }
}

/** The people a stage goes to, and why it went that way. */
export interface ChosenPeople {
  readonly people: readonly string[];
  readonly notes: readonly string[];
}

/**
 * Chooses a stage's people: inactive people are left out, the same person
 * chosen twice counts once, and the applicant never decides their own
 * request — a lone applicant-approver is replaced by their manager.
 */
export function choosePeople(
  stage: { readonly resolver: Resolver },
  context: ResolveContext,
): ChosenPeople {
  const notes: string[] = [];
  const chosen = candidatesOf(stage.resolver, context, notes);
  const unique = [...new Set(chosen)];
  if (unique.length < chosen.length)
    notes.push('A person chosen more than once is counted once.');
  let people = unique.filter((person) => person !== context.applicantId);
  if (people.length < unique.length) {
    notes.push(`${context.applicantId} may not decide their own request.`);
    if (!people.length) {
      const manager = managerChain(context.org, context.applicantId, 1, notes);
      if (manager !== undefined) {
        people = [manager];
        notes.push(`Passed to ${manager}, the applicant's manager.`);
      }
    }
  }
  if (!people.length)
    notes.push(
      'No qualified person could be assigned; an administrator has to reassign it.',
    );
  return { people, notes };
}

/** Whether a task still holds a responsibility: answered or not, never handed on or voided. */
function held(task: ApprovalTaskRow): boolean {
  return (
    task.status === 'pending' ||
    task.status === 'claimed' ||
    task.status === 'suspended' ||
    task.status === 'completed'
  );
}

function open(task: ApprovalTaskRow): boolean {
  return task.status === 'pending' || task.status === 'claimed';
}

/**
 * Chooses a stage's people now and gives each a task. The tasks wait,
 * suspended, until the stage is active; a pooled stage's tasks are its pool.
 */
export function resolveStage(
  work: ApprovalWork,
  stage: ApprovalStageRow,
  context: ResolveContext,
): void {
  const { people, notes } = choosePeople(stage, context);
  work.updateStage(stage.id, { resolvedAt: context.now });
  for (const message of notes)
    work.log('stage.note', { stageId: stage.id, message });
  for (const person of people) {
    const task = work.addTask({
      stageId: stage.id,
      kind: 'decide',
      assigneeId: person,
      via: 'plan',
      status: 'suspended',
    });
    work.log('task.assigned', {
      stageId: stage.id,
      taskId: task.id,
      userId: person,
      data: { via: 'plan' },
    });
  }
}

/** A pooled stage's taker, if anyone holds it. */
export function claimTask(
  work: ApprovalWork,
  stage: ApprovalStageRow,
): ApprovalTaskRow | undefined {
  return work
    .tasksOf(stage.id)
    .find((task) => held(task) && task.claimedAt !== null);
}

/** The tasks of the people whose decisions the stage adds up. */
export function responsibleTasks(
  work: ApprovalWork,
  stage: ApprovalStageRow,
): ApprovalTaskRow[] {
  if (stage.rule.kind === 'claim') {
    const taken = claimTask(work, stage);
    return taken ? [taken] : [];
  }
  return work.tasksOf(stage.id).filter(held);
}

/** The people whose decision this stage is waiting for, or has. */
export function responsible(
  work: ApprovalWork,
  stage: ApprovalStageRow,
): string[] {
  return [
    ...new Set(responsibleTasks(work, stage).map((task) => task.assigneeId)),
  ];
}

/** The answers that count, in the order they came in. */
export function votes(
  work: ApprovalWork,
  stage: ApprovalStageRow,
): ApprovalTaskRow[] {
  return work
    .tasksOf(stage.id)
    .filter((task) => task.status === 'completed' && task.decision !== null)
    .sort((a, b) => (a.closedSeq ?? 0) - (b.closedSeq ?? 0));
}

/** Whether the stage has decided, and how. */
export function tally(
  work: ApprovalWork,
  stage: ApprovalStageRow,
): 'approved' | 'rejected' | 'open' {
  const people = responsible(work, stage);
  const cast = votes(work, stage);
  const approvals = cast.filter((vote) => vote.decision === 'approve').length;
  const rejections = cast.filter((vote) => vote.decision === 'reject').length;
  const rule: StageRule = stage.rule;
  switch (rule.kind) {
    case 'first':
    case 'claim': {
      const first = cast[0];
      if (!first) return 'open';
      return first.decision === 'approve' ? 'approved' : 'rejected';
    }
    case 'any':
      if (approvals > 0) return 'approved';
      return rejections >= people.length && people.length > 0
        ? 'rejected'
        : 'open';
    case 'all':
      if (rejections > 0 && rule.onReject === 'immediate') return 'rejected';
      if (cast.length < people.length || people.length === 0) return 'open';
      return rejections > 0 ? 'rejected' : 'approved';
    case 'threshold': {
      if (
        cast.some(
          (vote) =>
            vote.decision === 'reject' &&
            rule.vetoers.includes(vote.assigneeId),
        )
      )
        return 'rejected';
      if (approvals >= rule.min) return 'approved';
      const undecided = people.length - cast.length;
      return approvals + undecided < rule.min ? 'rejected' : 'open';
    }
  }
}

/**
 * Puts a stage's held tasks in the state its turn implies: everyone's turn,
 * or in a pool, the taker's alone once someone took it.
 */
function resume(work: ApprovalWork, stage: ApprovalStageRow): void {
  const waiting = work
    .tasksOf(stage.id)
    .filter((task) => task.status === 'suspended' || open(task));
  const taker =
    stage.rule.kind === 'claim'
      ? waiting.find((task) => task.claimedAt !== null)
      : undefined;
  for (const task of waiting) {
    const status =
      taker === undefined
        ? 'pending'
        : task.id === taker.id
          ? 'claimed'
          : 'suspended';
    if (task.status !== status) work.updateTask(task.id, { status });
  }
}

/** Takes the turn away from a stage's open tasks, keeping who took a pool. */
export function suspend(work: ApprovalWork, stage: ApprovalStageRow): void {
  for (const task of work.tasksOf(stage.id))
    if (open(task)) work.updateTask(task.id, { status: 'suspended' });
}

/** Gives a stage the turn again after the request waited for something. */
export function resumeStage(work: ApprovalWork, stage: ApprovalStageRow): void {
  resume(work, stage);
}

function activate(work: ApprovalWork, stage: ApprovalStageRow): void {
  work.updateStage(stage.id, { status: 'active' });
  resume(work, stage);
  work.currentStageId = stage.id;
  work.log('stage.activated', { stageId: stage.id });
}

/** Voids a task with a reason, keeping a decision it holds as void history. */
export function voidTask(
  work: ApprovalWork,
  task: ApprovalTaskRow,
  reason: string,
): void {
  work.closeTask(task.id, 'voided', { closeReason: reason });
  work.log('task.voided', {
    stageId: task.stageId,
    taskId: task.id,
    userId: task.assigneeId,
    data: { reason },
  });
}

/**
 * Activates the first stage at or after `position` that still needs a
 * decision, and returns it. Stages already approved and kept are passed;
 * with `skipRepeated`, a lone assignee who approved an earlier stage this
 * round passes theirs, and the stage says which approval covered it.
 */
export function activateFrom(
  work: ApprovalWork,
  position: number,
  context: ResolveContext,
  policy: ApprovalPolicy,
): ApprovalStageRow | undefined {
  const round = work.round;
  const stages = work.stagesOf(round);
  for (const stage of stages) {
    if (stage.position < position) continue;
    if (stage.status === 'approved' || stage.status === 'skipped') continue;
    // A stage resolved when it was entered keeps its people until a return
    // or a revision resets it; transfers and reassignments survive.
    if (stage.resolvedAt === null) resolveStage(work, stage, context);
    const lone = responsible(work, stage);
    if (policy.skipRepeated && stage.rule.kind === 'all' && lone.length === 1) {
      const covering = stages.find(
        (earlier) =>
          earlier.position < stage.position &&
          earlier.status === 'approved' &&
          work
            .tasksOf(earlier.id)
            .some(
              (task) =>
                task.status === 'completed' &&
                task.assigneeId === lone[0] &&
                task.decision === 'approve' &&
                task.round === round,
            ),
      );
      if (covering) {
        const message = `${lone[0]} approved "${covering.key}" this round; that approval covers this stage.`;
        work.updateStage(stage.id, { status: 'skipped' });
        for (const task of work.tasksOf(stage.id))
          if (held(task)) voidTask(work, task, message);
        work.log('stage.skipped', {
          stageId: stage.id,
          message,
          data: { coveredBy: covering.id },
        });
        continue;
      }
    }
    activate(work, stage);
    return stage;
  }
  work.currentStageId = null;
  return undefined;
}

export interface ActingAs {
  /** The task the actor answers. */
  readonly task: ApprovalTaskRow;
  readonly principal: string;
  readonly onBehalf: boolean;
}

export interface Blocked {
  readonly code: string;
  readonly message: string;
}

/**
 * Whose task `actorId` answers on this stage: their own open task, or the
 * open task of someone whose delegation reaches them now. An inactive
 * person answers nothing, and nobody decides on the applicant's own request
 * through a delegation.
 */
export function actingAs(
  work: ApprovalWork,
  stage: ApprovalStageRow,
  actorId: string,
  context: {
    readonly org: OrgDirectory;
    readonly kind: string;
    readonly now: string;
    readonly applicantId: string;
  },
): ActingAs | Blocked {
  const { org } = context;
  if (!org.isActive(actorId))
    return { code: 'inactive', message: `${actorId} can no longer act.` };
  if (stage.rule.kind === 'claim' && claimTask(work, stage) === undefined)
    return {
      code: 'claimFirst',
      message: 'Someone has to take this from the pool first.',
    };
  const waiting = work.tasksOf(stage.id).filter(open);
  const own = waiting.find((task) => task.assigneeId === actorId);
  if (own) return { task: own, principal: actorId, onBehalf: false };
  if (actorId !== context.applicantId)
    for (const task of waiting) {
      const delegation = org.delegateOf(
        task.assigneeId,
        context.kind,
        context.now,
        task.createdAt,
      );
      if (delegation?.to === actorId)
        return { task, principal: task.assigneeId, onBehalf: true };
    }
  if (
    work
      .tasksOf(stage.id)
      .some(
        (task) => task.status === 'completed' && task.assigneeId === actorId,
      )
  )
    return {
      code: 'alreadyDecided',
      message: 'You have already decided on this stage.',
    };
  return {
    code: 'notAssignee',
    message: 'This stage is not waiting for your decision.',
  };
}

export function isBlocked(value: ActingAs | Blocked): value is Blocked {
  return 'code' in value;
}

/**
 * Puts a stage back to be decided again: its decisions become void history,
 * and one whose people are chosen on entry chooses them again then. One
 * chosen at submission gives the same people fresh tasks.
 */
export function resetStage(
  work: ApprovalWork,
  stage: ApprovalStageRow,
  note: string,
  by: string,
): void {
  const holders = work.tasksOf(stage.id).filter(held);
  for (const task of holders) voidTask(work, task, note);
  const keepPeople = stage.resolveAt === 'submit' && stage.resolvedAt !== null;
  work.updateStage(stage.id, {
    status: 'pending',
    basis: null,
    ...(keepPeople ? {} : { resolvedAt: null }),
  });
  if (keepPeople)
    for (const task of holders) {
      const fresh = work.addTask({
        stageId: stage.id,
        kind: 'decide',
        assigneeId: task.assigneeId,
        via: task.via,
        note: task.note,
        status: 'suspended',
      });
      work.log('task.assigned', {
        stageId: stage.id,
        taskId: fresh.id,
        userId: fresh.assigneeId,
        data: { via: fresh.via },
      });
    }
  if (work.currentStageId === stage.id) work.currentStageId = null;
  work.log('stage.reset', { stageId: stage.id, by, message: note });
}

/**
 * Ends the round before it concluded: a withdrawal, a return to the
 * applicant, a cancellation. Stages still to decide are cancelled with
 * their open decisions, and every open to-do of the round is voided.
 */
export function closeRound(
  work: ApprovalWork,
  reason: string,
  by: string,
): void {
  for (const stage of work.stagesOf(work.round)) {
    if (stage.status !== 'active' && stage.status !== 'pending') continue;
    for (const task of work.tasksOf(stage.id))
      if (held(task)) voidTask(work, task, reason);
    const wasActive = stage.status === 'active';
    work.updateStage(stage.id, { status: 'cancelled' });
    work.log('stage.cancelled', {
      stageId: stage.id,
      by,
      ...(wasActive ? { message: reason } : {}),
    });
  }
  for (const task of work.tasks(
    (each) =>
      each.kind !== 'decide' &&
      each.round === work.round &&
      (open(each) || each.status === 'suspended'),
  ))
    voidTask(work, task, reason);
  work.currentStageId = null;
}

/**
 * Moves one responsibility to another person, keeping everyone else and
 * every decision made: the old task is handed on, the new one takes its
 * place — in a pool, as the taker if the old one had taken it.
 */
export function replaceAssignee(
  work: ApprovalWork,
  task: ApprovalTaskRow,
  to: string,
  via: AssignedVia,
  note: string,
  by: string | null,
): ApprovalTaskRow {
  const stageId = task.stageId ?? '';
  // Someone already in the pool takes over their own place with this one.
  for (const other of work.tasksOf(stageId))
    if (
      other.id !== task.id &&
      other.assigneeId === to &&
      (open(other) || other.status === 'suspended')
    )
      voidTask(work, other, `${to} took over from ${task.assigneeId}.`);
  // Read before closing: the working rows change in place.
  const { status, claimedAt } = task;
  work.closeTask(task.id, 'transferred', { closeReason: note });
  const next = work.addTask({
    stageId,
    kind: 'decide',
    assigneeId: to,
    via,
    note,
    previousTaskId: task.id,
    status: status === 'completed' ? 'pending' : status,
    claimedAt: claimedAt === null ? null : work.now,
  });
  work.log('task.transferred', {
    stageId,
    taskId: next.id,
    by,
    userId: to,
    message: note,
    data: { from: task.assigneeId, via, previousTaskId: task.id },
  });
  return next;
}
