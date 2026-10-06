import type { JsonObject } from '@nocobase/lifecycle';

import type { TaskStatus } from './model.js';

/**
 * A member task as a policy sees it. `answer` is what the answer counts as
 * once the gates around it are taken into account: an approval still waiting
 * for a signer after it counts as no answer yet, and a rejection by a signer
 * counts as the member's rejection.
 */
export interface PolicyTask {
  readonly id: string;
  readonly assigneeId: string;
  readonly status: TaskStatus;
  readonly answer: string | null;
  readonly order: number;
  /** The order answers came in; null while unanswered. */
  readonly seq: number | null;
  readonly subject: string | null;
  /** What the subject was when the task was given out, with what the answer added. */
  readonly data: JsonObject | null;
}

/** A task a policy wants when its stage is entered. */
export interface PlannedTask {
  readonly assigneeId: string;
  readonly status: 'pending' | 'waiting' | 'candidate';
  readonly order?: number;
  readonly subject?: string | null;
}

/** What just happened on the stage. */
export type StageEvent =
  | { readonly kind: 'answered'; readonly taskId: string }
  | { readonly kind: 'claimed'; readonly taskId: string }
  | { readonly kind: 'released'; readonly taskId: string }
  | { readonly kind: 'changed' };

/**
 * How a stage ends: approved, rejected, returned to an earlier stage or to
 * `applicant`, or one of the approval's other exits by name — a partial
 * approval, say.
 */
export type StageResult =
  | 'approved'
  | 'rejected'
  | { readonly returnTo: string }
  | { readonly exit: string };

/**
 * Open: the stage goes on, with some tasks given their turn (`activate`),
 * taken out of a pool someone took (`suspend`), or put back in it
 * (`candidates`). Closed: the stage has its result.
 */
export type StageDecision =
  | {
      readonly kind: 'open';
      readonly activate?: readonly string[];
      readonly suspend?: readonly string[];
      readonly candidates?: readonly string[];
    }
  | {
      readonly kind: 'closed';
      readonly result: StageResult;
      /** What the result rests on, handed to the transition it fires. */
      readonly data?: JsonObject;
    };

export interface StagePlanContext<Options> {
  /** The people chosen for the stage, in order, each once. */
  readonly people: readonly string[];
  readonly options: Options;
}

export interface StageDecideContext<Options> {
  readonly tasks: readonly PolicyTask[];
  readonly options: Options;
  readonly event: StageEvent;
  /** The rules the run was submitted under. */
  readonly settings: JsonObject;
}

/** An answer a policy may refuse before it is written. */
export interface StageCheckContext<Options> {
  readonly task: PolicyTask;
  readonly answer: string;
  readonly comment: string | null;
  readonly data: JsonObject;
  readonly options: Options;
}

/**
 * How several people's answers make one stage's result. A policy is pure:
 * it plans the tasks a stage opens and reads the tasks back to decide, and
 * the approval layer does the writing. A business that needs another rule
 * writes another policy; nothing else changes.
 */
export interface StagePolicy<Options = unknown> {
  readonly kind: string;
  /** The answers a member may give besides approve and reject. */
  answers?(options: Options): readonly string[];
  /** Whether a member has to take the task from a pool before answering. */
  claimable?(options: Options): boolean;
  plan(context: StagePlanContext<Options>): readonly PlannedTask[];
  decide(context: StageDecideContext<Options>): StageDecision;
  /** What is wrong with an answer, or null. */
  check?(context: StageCheckContext<Options>): string | null;
}

const OPEN_DECISION: StageDecision = Object.freeze({ kind: 'open' });

function decided(tasks: readonly PolicyTask[]): PolicyTask[] {
  return tasks
    .filter((task) => task.answer !== null)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

function count(tasks: readonly PolicyTask[], answer: string): number {
  return tasks.filter((task) => task.answer === answer).length;
}

function everyone(people: readonly string[]): PlannedTask[] {
  return people.map((assigneeId, order) => ({
    assigneeId,
    status: 'pending',
    order,
  }));
}

export interface AllOptions {
  /** End at the first rejection, or collect every opinion before rejecting. */
  readonly onReject: 'immediate' | 'collect';
}

/** Everyone approves; one person is the case of a single approver. */
export const allPolicy: StagePolicy<AllOptions> = {
  kind: 'all',
  plan: ({ people }) => everyone(people),
  decide: ({ tasks, options }) => {
    const rejections = count(tasks, 'reject');
    if (rejections > 0 && options.onReject === 'immediate')
      return { kind: 'closed', result: 'rejected' };
    if (!tasks.length || decided(tasks).length < tasks.length)
      return OPEN_DECISION;
    return { kind: 'closed', result: rejections > 0 ? 'rejected' : 'approved' };
  },
};

/** At least one approval; rejected once nobody is left who could approve. */
export const anyPolicy: StagePolicy<Record<string, never>> = {
  kind: 'any',
  plan: ({ people }) => everyone(people),
  decide: ({ tasks }) => {
    if (count(tasks, 'approve') > 0)
      return { kind: 'closed', result: 'approved' };
    return tasks.length > 0 && decided(tasks).length === tasks.length
      ? { kind: 'closed', result: 'rejected' }
      : OPEN_DECISION;
  },
};

/** The first answer decides, whichever way it goes. */
export const firstPolicy: StagePolicy<Record<string, never>> = {
  kind: 'first',
  plan: ({ people }) => everyone(people),
  decide: ({ tasks }) => {
    const first = decided(tasks)[0];
    if (!first) return OPEN_DECISION;
    return {
      kind: 'closed',
      result: first.answer === 'approve' ? 'approved' : 'rejected',
    };
  },
};

export interface ThresholdOptions {
  readonly min: number;
  /** People whose rejection ends it at once. */
  readonly vetoers?: readonly string[];
  /** Whether a member may abstain: counted as cast, never as approval. */
  readonly abstain?: boolean;
}

/** A vote: approved at `min` approvals, rejected once `min` is out of reach. */
export const thresholdPolicy: StagePolicy<ThresholdOptions> = {
  kind: 'threshold',
  answers: (options) => (options.abstain ? ['abstain'] : []),
  plan: ({ people }) => everyone(people),
  decide: ({ tasks, options }) => {
    const vetoers = options.vetoers ?? [];
    if (
      tasks.some(
        (task) => task.answer === 'reject' && vetoers.includes(task.assigneeId),
      )
    )
      return { kind: 'closed', result: 'rejected' };
    const approvals = count(tasks, 'approve');
    if (approvals >= options.min) return { kind: 'closed', result: 'approved' };
    const undecided = tasks.length - decided(tasks).length;
    return approvals + undecided < options.min
      ? { kind: 'closed', result: 'rejected' }
      : OPEN_DECISION;
  },
};

export interface ClaimableOptions {
  /** Whether a candidate must take it before answering; otherwise the first answer decides. */
  readonly mustClaim: boolean;
}

/**
 * A pool: whoever takes it holds it and the others are suspended until it
 * is released; the first answer decides.
 */
export const claimablePolicy: StagePolicy<ClaimableOptions> = {
  kind: 'claimable',
  claimable: (options) => options.mustClaim,
  plan: ({ people, options }) =>
    people.map((assigneeId, order) => ({
      assigneeId,
      status: options.mustClaim ? 'candidate' : 'pending',
      order,
    })),
  decide: ({ tasks, event, options }) => {
    if (event.kind === 'claimed')
      return {
        kind: 'open',
        suspend: tasks
          .filter(
            (task) =>
              task.id !== event.taskId &&
              (task.status === 'candidate' || task.status === 'pending'),
          )
          .map((task) => task.id),
      };
    if (event.kind === 'released')
      return {
        kind: 'open',
        ...(options.mustClaim
          ? {
              candidates: tasks
                .filter(
                  (task) =>
                    task.status === 'suspended' || task.status === 'claimed',
                )
                .map((task) => task.id),
            }
          : {
              activate: tasks
                .filter(
                  (task) =>
                    task.status === 'suspended' || task.status === 'claimed',
                )
                .map((task) => task.id),
            }),
      };
    return firstPolicy.decide({ tasks, event, options: {}, settings: {} });
  },
};

/** One after another in order; the first rejection rejects. */
export const sequentialPolicy: StagePolicy<Record<string, never>> = {
  kind: 'sequential',
  plan: ({ people }) =>
    people.map((assigneeId, order) => ({
      assigneeId,
      status: order === 0 ? 'pending' : 'waiting',
      order,
    })),
  decide: ({ tasks }) => {
    if (count(tasks, 'reject') > 0)
      return { kind: 'closed', result: 'rejected' };
    const next = [...tasks]
      .filter((task) => task.answer === null)
      .sort((a, b) => a.order - b.order)[0];
    if (!next) return { kind: 'closed', result: 'approved' };
    return next.status === 'waiting'
      ? { kind: 'open', activate: [next.id] }
      : OPEN_DECISION;
  },
};

export interface ItemizedOptions {
  /** The settings key that says whether a partial approval may stand. */
  readonly partialSetting: string;
}

/**
 * One task per subject — a line of a claim — each approved, rejected or
 * returned on its own. Once every line is decided the stage ends approved,
 * rejected, partially approved (`exit: partiallyApproved`) or with the
 * returned lines back to the applicant; without partial
 * approval a single rejection rejects at once. The result carries each
 * line's decision and the approved total.
 */
export const itemizedPolicy: StagePolicy<ItemizedOptions> = {
  kind: 'itemized',
  answers: () => ['return'],
  plan: ({ people }) => everyone(people),
  check: ({ task, answer, comment, data }) => {
    if ((answer === 'reject' || answer === 'return') && !comment)
      return 'Say why.';
    const asked = data.approvedCents;
    if (asked === undefined) return null;
    if (answer !== 'approve') return 'Only an approval has an amount.';
    if (typeof asked !== 'number' || !Number.isSafeInteger(asked) || asked <= 0)
      return 'Approve a positive amount.';
    const claimed = Number(task.data?.amountCents ?? 0);
    return asked > claimed
      ? `Line "${task.subject ?? ''}" claims ${claimed}; ${asked} cannot be approved.`
      : null;
  },
  decide: ({ tasks, settings, options }) => {
    const partial = settings[options.partialSetting] !== false;
    const decisions: JsonObject = {};
    let total = 0;
    for (const task of tasks) {
      if (task.answer === null || task.subject === null) continue;
      const approvedCents =
        task.answer === 'approve'
          ? Number(task.data?.approvedCents ?? task.data?.amountCents ?? 0)
          : 0;
      total += approvedCents;
      decisions[task.subject] = {
        outcome: task.answer,
        approvedCents,
        hash: (task.data?.hash ?? null) as string | null,
      };
    }
    const data: JsonObject = { decisions, approvedTotalCents: total };
    const answers = tasks.map((task) => task.answer);
    if (!partial && answers.includes('reject'))
      return { kind: 'closed', result: 'rejected', data };
    if (answers.includes(null)) return OPEN_DECISION;
    if (answers.includes('return'))
      return { kind: 'closed', result: { returnTo: 'applicant' }, data };
    if (answers.every((answer) => answer === 'approve'))
      return { kind: 'closed', result: 'approved', data };
    if (answers.every((answer) => answer === 'reject'))
      return { kind: 'closed', result: 'rejected', data };
    return { kind: 'closed', result: { exit: 'partiallyApproved' }, data };
  },
};
