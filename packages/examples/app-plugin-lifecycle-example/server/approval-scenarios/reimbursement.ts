// Scenario 23: a reimbursement whose lines are decided one by one.
//
// The lines live on the record as JSON, each with its own approver and its
// own decision. Every decision is a transition of the one record, so the
// sheet's outcome and approved total are computed in the same write as the
// decision that settles them, and two approvers deciding at once meet the
// record's version check rather than overwriting each other. Each decision
// carries the hash of the line content it was made on; a decision on content
// that has changed since — through a return, or an edit outside the
// lifecycle — is refused.
import { createHash } from 'node:crypto';

import {
  defineEffect,
  defineLifecycle,
  LifecycleError,
  type EffectDefinition,
  type GuardVerdict,
  type InputProblem,
  type JsonObject,
  type JsonValue,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import {
  PaymentDeclined,
  SCENARIO_COLLECTIONS,
  type ScenarioServices,
} from './services.js';

export type ReimbursementState =
  | 'draft'
  | 'inReview'
  | 'returned'
  | 'approved'
  | 'partiallyApproved'
  | 'paymentFailed'
  | 'rejected'
  | 'withdrawn'
  | 'paid';

/** What an approver can say about one line. */
export type LineOutcome = 'approved' | 'rejected' | 'returned';

export interface LineDecision {
  readonly outcome: LineOutcome;
  readonly by: string;
  readonly at: string;
  /** The hash of the line content the decision was made on. */
  readonly contentHash: string;
  /** The submission round the decision belongs to. */
  readonly round: number;
  /** For an approval below the claimed amount. */
  readonly approvedCents?: number;
  readonly comment?: string;
}

/** What the applicant writes for a line. */
export interface LineContent {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly amountCents: number;
}

export interface ReimbursementLine extends LineContent {
  /** Set on submission from the category; null in a draft. */
  readonly approverId: string | null;
  /** The hash of the content as it was submitted; null in a draft. */
  readonly contentHash: string | null;
  readonly decision: LineDecision | null;
}

/** The rules a sheet was submitted under; later parameter changes do not reach it. */
export interface ReimbursementPolicy {
  readonly partialAllowed: boolean;
  /** Whether decisions on unchanged lines survive a return. */
  readonly retainOnReturn: boolean;
}

export interface Reimbursement extends LifecycleRecord {
  readonly title: string;
  readonly applicantId: string;
  readonly lines: readonly ReimbursementLine[];
  readonly status: ReimbursementState;
  readonly statusChangedAt: string;
  readonly lifecycleVersion: number;
  readonly round?: number;
  readonly policy?: ReimbursementPolicy | null;
  readonly approvedTotalCents?: number;
  /** Payment references by line id, once paid. */
  readonly payments?: Readonly<Record<string, string>> | null;
  readonly paymentError?: string | null;
  /** The sheet whose rejected lines this one asks for again. */
  readonly followUpOf?: string | number | null;
}

export interface ReimbursementParameters {
  /** Whether a sheet may end with some lines approved and others rejected. */
  allowPartialApproval: boolean;
  /** Whether a return keeps the decisions on the lines that were not returned. */
  retainDecisionsOnReturn: boolean;
  /** `single`: every line to the applicant's manager; `byCategory`: by `categoryRoles`. */
  routing: 'single' | 'byCategory';
  /** Category → role whose first active holder decides it; others go to the manager. */
  categoryRoles: Readonly<Record<string, string>>;
  /** The role that may retry a failed payment. */
  financeRole: string;
  remindAfterHours: number;
}

export interface ReimbursementTypes {
  record: Reimbursement;
  state: ReimbursementState;
  parameters: ReimbursementParameters;
  services: ScenarioServices;
}

type Context = TransitionContext<ReimbursementTypes>;

/** The part of a line a decision is bound to. */
export function lineHash(line: LineContent): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        line.id,
        line.category,
        line.description,
        line.amountCents,
      ]),
    )
    .digest('hex')
    .slice(0, 16);
}

/** The hash of every line, for a decision on the whole sheet. */
export function sheetHash(lines: readonly LineContent[]): string {
  return createHash('sha256')
    .update(lines.map(lineHash).join(':'))
    .digest('hex')
    .slice(0, 16);
}

function approvedAmount(line: ReimbursementLine): number {
  return line.decision?.outcome === 'approved'
    ? (line.decision.approvedCents ?? line.amountCents)
    : 0;
}

/** The approved total: each approved line at the amount its approver allowed. */
export function approvedTotal(lines: readonly ReimbursementLine[]): number {
  return lines.reduce((sum, line) => sum + approvedAmount(line), 0);
}

/**
 * Where the sheet stands once its lines are as given. Undecided lines keep
 * it in review — unless partial approval is not allowed and a line is
 * already rejected, which settles the whole sheet. Returned lines go back to
 * the applicant once nothing else is waiting.
 */
export function sheetOutcome(
  lines: readonly ReimbursementLine[],
  partialAllowed: boolean,
): ReimbursementState {
  const outcomes = lines.map((line) => line.decision?.outcome ?? null);
  if (!partialAllowed && outcomes.includes('rejected')) return 'rejected';
  if (outcomes.includes(null)) return 'inReview';
  if (outcomes.includes('returned')) return 'returned';
  if (outcomes.every((outcome) => outcome === 'approved')) return 'approved';
  if (outcomes.every((outcome) => outcome === 'rejected')) return 'rejected';
  return 'partiallyApproved';
}

function policyOf(record: Reimbursement): ReimbursementPolicy {
  return record.policy ?? { partialAllowed: true, retainOnReturn: true };
}

function stringOf(input: JsonObject, field: string): string | undefined {
  const value = input[field];
  return typeof value === 'string' ? value : undefined;
}

function isApplicant({ record, actor }: Context): GuardVerdict {
  return (
    actor.id === record.applicantId || {
      code: 'applicantOnly',
      message: 'Only the applicant can do this.',
    }
  );
}

function systemOnly({ actor }: Context): GuardVerdict {
  return actor.system === true || 'Only the system does this.';
}

function pendingLinesOf(
  record: Reimbursement,
  actor: string,
): ReimbursementLine[] {
  return record.lines.filter(
    (line) => line.decision === null && line.approverId === actor,
  );
}

/** The person who decides a line of this category, or undefined when nobody can. */
function approverFor(
  category: string,
  applicant: string,
  { parameters, services }: Context,
): string | undefined {
  const role =
    parameters.routing === 'byCategory'
      ? parameters.categoryRoles[category]
      : undefined;
  const approver =
    role === undefined
      ? services.org.managerOf(applicant)
      : services.org.holderOf(role);
  return approver !== undefined && services.org.isActive(approver)
    ? approver
    : undefined;
}

function contentProblems(lines: readonly LineContent[]): string[] {
  const problems: string[] = [];
  if (!lines.length) problems.push('Add at least one line.');
  const ids = new Set<string>();
  for (const line of lines) {
    if (ids.has(line.id)) problems.push(`Line "${line.id}" repeats.`);
    ids.add(line.id);
    if (!Number.isSafeInteger(line.amountCents) || line.amountCents <= 0)
      problems.push(`Line "${line.id}" needs a positive amount.`);
  }
  return problems;
}

/**
 * Assigns each line its approver and binds it to its content. A line nobody
 * can decide refuses the submission: it is not approved by default.
 */
function routeLines(
  lines: readonly ReimbursementLine[],
  context: Context,
  keep: (line: ReimbursementLine) => boolean,
): ReimbursementLine[] {
  return lines.map((line) => {
    if (keep(line)) return line;
    const approverId = approverFor(
      line.category,
      context.record.applicantId,
      context,
    );
    if (approverId === undefined)
      throw new LifecycleError(
        'GUARD_REJECTED',
        `Nobody can decide line "${line.id}" (${line.category}).`,
        {
          blockers: [
            {
              source: 'guard',
              code: 'noApprover',
              message: `Nobody can decide line "${line.id}" (${line.category}).`,
            },
          ],
        },
      );
    return { ...line, approverId, contentHash: lineHash(line), decision: null };
  });
}

/**
 * Whether a line still says what it said when it was submitted. An edit
 * that bypassed the lifecycle changes the content but not the stored hash.
 */
function intact(line: ReimbursementLine): boolean {
  return line.contentHash !== null && line.contentHash === lineHash(line);
}

interface LineChoice {
  readonly lineId: string;
  readonly outcome: LineOutcome;
  readonly contentHash: string;
  readonly approvedCents?: number;
  readonly comment?: string;
}

const OUTCOMES: readonly string[] = ['approved', 'rejected', 'returned'];

function isOutcome(value: JsonValue | undefined): boolean {
  return typeof value === 'string' && OUTCOMES.includes(value);
}

function choiceOf(input: JsonObject): LineChoice | undefined {
  const lineId = stringOf(input, 'lineId');
  const outcome = stringOf(input, 'outcome');
  const contentHash = stringOf(input, 'contentHash');
  if (
    lineId === undefined ||
    outcome === undefined ||
    contentHash === undefined ||
    !OUTCOMES.includes(outcome)
  )
    return undefined;
  const approvedCents = input.approvedCents;
  const comment = stringOf(input, 'comment');
  return {
    lineId,
    outcome: outcome as LineOutcome,
    contentHash,
    ...(typeof approvedCents === 'number' ? { approvedCents } : {}),
    ...(comment === undefined ? {} : { comment }),
  };
}

/** The lines with the actor's choices applied; the guard has checked them. */
function decided(
  context: Context,
  choices: readonly LineChoice[],
): ReimbursementLine[] {
  const { record, actor, now } = context;
  const round = record.round ?? 1;
  return record.lines.map((line) => {
    const choice = choices.find((candidate) => candidate.lineId === line.id);
    if (!choice) return line;
    const decision: LineDecision = {
      outcome: choice.outcome,
      by: actor.id,
      at: now.toISOString(),
      contentHash: choice.contentHash,
      round,
      ...(choice.outcome === 'approved' && choice.approvedCents !== undefined
        ? { approvedCents: choice.approvedCents }
        : {}),
      ...(choice.comment === undefined ? {} : { comment: choice.comment }),
    };
    return { ...line, decision };
  });
}

function mayDecide({ record, actor, services }: Context): GuardVerdict {
  if (actor.id === record.applicantId)
    return { code: 'selfApproval', message: 'Nobody decides their own claim.' };
  if (!services.org.isActive(actor.id))
    return { code: 'inactive', message: 'An inactive person cannot decide.' };
  return true;
}

/**
 * Deciding one line. Without a line in the input — as `available()` asks —
 * it answers whether the actor has any line waiting for them.
 */
function guardLineDecision(context: Context): GuardVerdict {
  const allowed = mayDecide(context);
  if (allowed !== true) return allowed;
  const { record, actor, input } = context;
  const lineId = stringOf(input, 'lineId');
  if (lineId === undefined)
    return (
      pendingLinesOf(record, actor.id).length > 0 || {
        code: 'nothingToDecide',
        message: 'No line is waiting for you.',
      }
    );
  const line = record.lines.find((candidate) => candidate.id === lineId);
  if (!line) return { code: 'unknownLine', message: `No line "${lineId}".` };
  if (line.approverId !== actor.id)
    return {
      code: 'notYourLine',
      message: `Line "${lineId}" is not yours to decide.`,
    };
  if (line.decision !== null)
    return {
      code: 'alreadyDecided',
      message: `Line "${lineId}" is already decided.`,
    };
  if (!intact(line))
    return {
      code: 'contentChanged',
      message: `Line "${lineId}" was changed outside the review; it cannot be decided as it is.`,
    };
  if (input.contentHash !== line.contentHash)
    return {
      code: 'contentStale',
      message: `Line "${lineId}" is not what you were shown; reload it.`,
    };
  return true;
}

function validateLineDecision(input: JsonObject): InputProblem[] {
  const problems: InputProblem[] = [];
  if (typeof input.lineId !== 'string')
    problems.push({ field: 'lineId', message: 'Choose a line.' });
  if (!isOutcome(input.outcome))
    problems.push({
      field: 'outcome',
      message: 'Choose approved, rejected or returned.',
    });
  if (typeof input.contentHash !== 'string')
    problems.push({
      field: 'contentHash',
      message: 'Say which content you decided on.',
    });
  const cents = input.approvedCents;
  if (
    cents !== undefined &&
    (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents <= 0)
  )
    problems.push({
      field: 'approvedCents',
      message: 'Approve a positive amount.',
    });
  if (input.outcome !== 'approved' && cents !== undefined)
    problems.push({
      field: 'approvedCents',
      message: 'Only an approval has an amount.',
    });
  if (
    (input.outcome === 'rejected' || input.outcome === 'returned') &&
    !(typeof input.comment === 'string' && input.comment.trim())
  )
    problems.push({ field: 'comment', message: 'Say why.' });
  return problems;
}

function lineChoices(context: Context): LineChoice[] {
  const choice = choiceOf(context.input);
  if (!choice) return [];
  const line = context.record.lines.find(
    (candidate) => candidate.id === choice.lineId,
  );
  // An amount above the claim is the input's problem, not the guard's: the
  // approver may allow less, never more.
  if (
    line &&
    choice.approvedCents !== undefined &&
    choice.approvedCents > line.amountCents
  )
    throw new LifecycleError(
      'INVALID_INPUT',
      `Line "${line.id}" claims ${line.amountCents}; ${choice.approvedCents} cannot be approved.`,
      {
        problems: [{ field: 'approvedCents', message: 'More than the claim.' }],
      },
    );
  return [choice];
}

/** A decision on every line the actor holds, bound to the whole sheet. */
function sheetChoices(context: Context): LineChoice[] {
  const { record, actor, input } = context;
  const outcome = stringOf(input, 'outcome') as LineOutcome;
  const comment = stringOf(input, 'comment');
  return pendingLinesOf(record, actor.id).map((line) => ({
    lineId: line.id,
    outcome,
    contentHash: line.contentHash ?? '',
    ...(comment === undefined ? {} : { comment }),
  }));
}

function guardSheetDecision(context: Context): GuardVerdict {
  const allowed = mayDecide(context);
  if (allowed !== true) return allowed;
  const { record, actor, input } = context;
  if (!pendingLinesOf(record, actor.id).length)
    return { code: 'nothingToDecide', message: 'No line is waiting for you.' };
  if (!record.lines.every(intact))
    return {
      code: 'contentChanged',
      message:
        'The sheet was changed outside the review; it cannot be decided as it is.',
    };
  if (
    input.sheetHash !== undefined &&
    input.sheetHash !== sheetHash(record.lines)
  )
    return {
      code: 'contentStale',
      message: 'The sheet is not what you were shown; reload it.',
    };
  return true;
}

function settled(lines: readonly ReimbursementLine[]): Record<string, unknown> {
  return { lines, approvedTotalCents: approvedTotal(lines) };
}

interface PaymentRun extends JsonObject {
  payments: Record<string, string>;
}

/**
 * Pays every approved line, each under its own business key — the sheet,
 * the line and the content it was approved on. The run's `idempotencyKey`
 * is not enough: a retry after `paymentFailed` is a new run with a new key,
 * and a line paid by the first run must not be paid again.
 */
export const payApprovedLines: EffectDefinition<ReimbursementTypes> =
  defineEffect<ReimbursementTypes>({
    name: 'reimbursements.payApprovedLines',
    retry: {
      attempts: 2,
      shouldRetry: (error) => !(error instanceof PaymentDeclined),
    },
    onSuccess: 'markPaid',
    onFailure: 'markPaymentFailed',
    async run({ record, services }): Promise<PaymentRun> {
      const payments: Record<string, string> = {};
      for (const line of record.lines) {
        const amount = approvedAmount(line);
        if (amount === 0) continue;
        const key = `reimbursement:${String(record.id)}:${line.id}:${line.decision?.contentHash ?? ''}`;
        payments[line.id] = (
          await services.external.pay(key, record.applicantId, amount)
        ).reference;
      }
      return { payments };
    },
  });

/** Tells each approver about the lines waiting for them, once per line content. */
export const notifyLineApprovers: EffectDefinition<ReimbursementTypes> =
  defineEffect<ReimbursementTypes>({
    name: 'reimbursements.notifyLineApprovers',
    async run({ record, services }) {
      const notified: string[] = [];
      for (const line of record.lines)
        if (line.decision === null && line.approverId !== null) {
          await services.outbox.send(
            line.approverId,
            `To decide: ${record.title} / ${line.id}`,
            `reimbursement:${String(record.id)}:${line.id}:${line.contentHash ?? ''}`,
          );
          notified.push(line.approverId);
        }
      return { notified };
    },
  });

/** A reminder for whoever still has a line waiting; one per line per day. */
export const remindLineApprovers: EffectDefinition<ReimbursementTypes> =
  defineEffect<ReimbursementTypes>({
    name: 'reimbursements.remindLineApprovers',
    async run({ record, services, now }) {
      const day = now.toISOString().slice(0, 10);
      for (const line of record.lines)
        if (line.decision === null && line.approverId !== null)
          await services.outbox.send(
            line.approverId,
            `Reminder: ${record.title} / ${line.id}`,
            `reimbursement:remind:${String(record.id)}:${line.id}:${day}`,
          );
    },
  });

function parseContent(value: JsonValue | undefined): LineContent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const lines: LineContent[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      return undefined;
    const { id, category, description, amountCents } = item;
    if (
      typeof id !== 'string' ||
      typeof category !== 'string' ||
      typeof description !== 'string' ||
      typeof amountCents !== 'number'
    )
      return undefined;
    lines.push({ id, category, description, amountCents });
  }
  return lines;
}

/**
 * The lines after a resubmission: the returned lines with their corrected
 * content, the dropped ones gone. A rejected or approved line cannot be
 * corrected on this sheet; rejected lines are asked for again with
 * {@link requestRejectedLinesAgain}.
 */
function corrected(context: Context): ReimbursementLine[] {
  const { record, input } = context;
  const changes = parseContent(input.lines) ?? [];
  const dropped = Array.isArray(input.drop)
    ? input.drop.filter((id): id is string => typeof id === 'string')
    : [];
  const policy = policyOf(record);
  const lines = record.lines
    .filter((line) => !dropped.includes(line.id))
    .map((line): ReimbursementLine => {
      const change = changes.find((candidate) => candidate.id === line.id);
      const content = change ?? line;
      const returned = line.decision?.outcome === 'returned';
      const reset = returned || !policy.retainOnReturn;
      return {
        ...line,
        ...content,
        // A kept decision still has to be about the content it was made on.
        decision:
          reset || lineHash(content) !== line.decision?.contentHash
            ? null
            : line.decision,
        contentHash: reset ? null : line.contentHash,
      };
    });
  return routeLines(lines, context, (line) => line.decision !== null);
}

/** The applicant submits, and every line has someone to decide it. */
function guardSubmission(context: Context): GuardVerdict {
  const applicant = isApplicant(context);
  if (applicant !== true) return applicant;
  const orphan = context.record.lines.find(
    (line) =>
      approverFor(line.category, context.record.applicantId, context) ===
      undefined,
  );
  return (
    orphan === undefined || {
      code: 'noApprover',
      message: `Nobody can decide line "${orphan.id}" (${orphan.category}).`,
    }
  );
}

function guardResubmission(context: Context): GuardVerdict {
  const applicant = isApplicant(context);
  if (applicant !== true) return applicant;
  const { record, input } = context;
  const touched = [
    ...(parseContent(input.lines) ?? []).map((line) => line.id),
    ...(Array.isArray(input.drop) ? input.drop.map(String) : []),
  ];
  for (const id of touched) {
    const line = record.lines.find((candidate) => candidate.id === id);
    if (!line) return { code: 'unknownLine', message: `No line "${id}".` };
    if (line.decision?.outcome !== 'returned')
      return {
        code: 'notReturned',
        message: `Line "${id}" was not returned; only returned lines can be changed.`,
      };
  }
  return true;
}

/**
 * Scenario 23. A reimbursement of several lines, each decided by the person
 * its category names. A sheet settles once every line is decided: approved,
 * rejected, or — when partial approval is allowed — partially approved with
 * the total of its approved lines. Returned lines go back to the applicant,
 * who corrects or drops them while the other decisions stand. Payment covers
 * the approved lines only, each under its own key.
 */
export const reimbursementLifecycle: Lifecycle<ReimbursementTypes> =
  defineLifecycle<ReimbursementTypes>({
    name: 'reimbursements',
    collection: SCENARIO_COLLECTIONS.reimbursements,
    initial: 'draft',
    states: [
      'draft',
      'inReview',
      'returned',
      'approved',
      'partiallyApproved',
      'paymentFailed',
      { name: 'rejected', final: true },
      { name: 'withdrawn', final: true },
      { name: 'paid', final: true },
    ],
    parameters: {
      allowPartialApproval: true,
      retainDecisionsOnReturn: true,
      routing: 'byCategory',
      categoryRoles: {},
      financeRole: 'finance',
      remindAfterHours: 24,
    },
    transitions: {
      submit: {
        from: 'draft',
        to: 'inReview',
        guard: guardSubmission,
        set: (context) => {
          const problems = contentProblems(context.record.lines);
          if (problems.length)
            throw new LifecycleError('INVALID_INPUT', problems.join(' '));
          return {
            lines: routeLines(context.record.lines, context, () => false),
            round: 1,
            approvedTotalCents: 0,
            policy: {
              partialAllowed: context.parameters.allowPartialApproval,
              retainOnReturn: context.parameters.retainDecisionsOnReturn,
            },
          };
        },
        effects: [notifyLineApprovers],
      },
      decideLine: {
        from: 'inReview',
        to: [
          'inReview',
          'returned',
          'approved',
          'partiallyApproved',
          'rejected',
        ],
        guard: guardLineDecision,
        validate: validateLineDecision,
        route: (context) =>
          sheetOutcome(
            decided(context, lineChoices(context)),
            policyOf(context.record).partialAllowed,
          ),
        set: (context) => settled(decided(context, lineChoices(context))),
      },
      decideSheet: {
        from: 'inReview',
        to: [
          'inReview',
          'returned',
          'approved',
          'partiallyApproved',
          'rejected',
        ],
        guard: guardSheetDecision,
        validate: (input) =>
          isOutcome(input.outcome) && typeof input.sheetHash === 'string'
            ? null
            : 'Choose an outcome for the content you were shown.',
        route: (context) =>
          sheetOutcome(
            decided(context, sheetChoices(context)),
            policyOf(context.record).partialAllowed,
          ),
        set: (context) => settled(decided(context, sheetChoices(context))),
      },
      resubmit: {
        from: 'returned',
        to: ['inReview', 'approved', 'partiallyApproved', 'rejected'],
        guard: guardResubmission,
        validate: (input) =>
          input.lines === undefined || parseContent(input.lines)
            ? null
            : [
                {
                  field: 'lines',
                  message:
                    'Each line needs an id, a category, a description and an amount.',
                },
              ],
        route: (context) =>
          sheetOutcome(
            corrected(context),
            policyOf(context.record).partialAllowed,
          ),
        set: (context) => {
          const lines = corrected(context);
          const problems = contentProblems(lines);
          if (problems.length)
            throw new LifecycleError('INVALID_INPUT', problems.join(' '));
          return {
            lines,
            round: (context.record.round ?? 1) + 1,
            approvedTotalCents: approvedTotal(lines),
          };
        },
        effects: [notifyLineApprovers],
      },
      withdraw: {
        from: ['inReview', 'returned'],
        to: 'withdrawn',
        guard: isApplicant,
      },
      remindApprovers: {
        from: 'inReview',
        to: 'inReview',
        guard: systemOnly,
        effects: [remindLineApprovers],
      },
      markPaid: {
        from: ['approved', 'partiallyApproved'],
        to: 'paid',
        guard: systemOnly,
        set: ({ input }) => ({
          payments: input.payments ?? {},
          paymentError: null,
        }),
      },
      markPaymentFailed: {
        from: ['approved', 'partiallyApproved'],
        to: 'paymentFailed',
        guard: systemOnly,
        set: ({ input }) => ({
          paymentError: stringOf(input, 'error') ?? 'Payment failed.',
        }),
      },
      retryPayment: {
        from: 'paymentFailed',
        to: ['approved', 'partiallyApproved'],
        guard: ({ actor, parameters, services }) =>
          services.org.hasRole(actor.id, parameters.financeRole) || {
            code: 'financeOnly',
            message: 'Only finance can retry a payment.',
          },
        route: ({ record }) =>
          record.lines.every((line) => line.decision?.outcome === 'approved')
            ? 'approved'
            : 'partiallyApproved',
      },
    },
    onEnter: {
      approved: [payApprovedLines],
      partiallyApproved: [payApprovedLines],
    },
    triggers: {
      remind: {
        transition: 'remindApprovers',
        when: 'inReview',
        after: ({ remindAfterHours }) => remindAfterHours * 3_600_000,
      },
    },
  });

/**
 * Asks again for the lines a settled sheet rejected, as a new sheet in
 * draft: the rejections stay on the old one as they were made, and the new
 * one is decided afresh. Returns the new sheet.
 */
export async function requestRejectedLinesAgain(
  services: ScenarioServices,
  sheet: Reimbursement,
  actor: string,
): Promise<LifecycleRecord> {
  if (actor !== sheet.applicantId)
    throw new LifecycleError(
      'GUARD_REJECTED',
      'Only the applicant can ask again.',
    );
  if (!['partiallyApproved', 'rejected', 'paid'].includes(sheet.status))
    throw new LifecycleError('INVALID_STATE', 'The sheet is not settled.');
  const rejected = sheet.lines.filter(
    (line) => line.decision?.outcome === 'rejected',
  );
  if (!rejected.length)
    throw new LifecycleError('INVALID_STATE', 'No line was rejected.');
  const { record } = await services.lifecycles.create(
    'reimbursements',
    {
      title: `${sheet.title} (again)`,
      applicantId: sheet.applicantId,
      followUpOf: sheet.id,
      lines: rejected.map((line) => ({
        id: line.id,
        category: line.category,
        description: line.description,
        amountCents: line.amountCents,
        approverId: null,
        contentHash: null,
        decision: null,
      })),
    },
    { actor: { id: actor }, input: { followUpOf: String(sheet.id) } },
  );
  return record;
}
