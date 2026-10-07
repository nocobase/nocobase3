import {
  defineEffect,
  defineLifecycle,
  LifecycleError,
  type EffectDefinition,
  type GuardVerdict,
  type JsonObject,
  type JsonValue,
  type Lifecycle,
  type LifecycleRecord,
  type LifecycleRuntime,
  type RecordId,
  type SetContext,
  type TransitionContext,
} from '@nocobase/lifecycle';

import { PaymentDeclined } from './services.js';
import {
  defineApproval,
  itemizedPolicy,
  stagesFor,
  type Approval,
} from '@nocobase/app-plugin-approval/server';
import { directoryOf, text, type ScenarioServices } from './services.js';

// Scenario 23: a reimbursement whose lines are decided one by
// one. The lines stay on the record, which waits in `approving`; deciding
// them is the approval layer's run: one task per line, each held by whoever
// the line's category names, and an itemized policy that ends the run
// approved, partially approved, rejected or with the returned lines back to
// the applicant. Approvers of different lines answer different tasks, so
// they never meet each other's version; the record moves once, when every
// line is decided. What the decisions came to — per line, and the approved
// total — is written on the record by the exit that run's end fires.

export type ReimbursementState =
  | 'draft'
  | 'approving'
  | 'returned'
  | 'approved'
  | 'partiallyApproved'
  | 'paymentFailed'
  | 'rejected'
  | 'withdrawn'
  | 'paid';

export interface LineContent {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly amountCents: number;
}

export interface LineDecision {
  readonly outcome: 'approve' | 'reject' | 'return';
  readonly approvedCents: number;
  /** The hash of the line content the decision was made on. */
  readonly hash: string | null;
}

export interface Reimbursement extends LifecycleRecord {
  readonly title: string;
  readonly applicantId: string;
  readonly lines: readonly LineContent[];
  readonly decisions: Readonly<Record<string, LineDecision>> | null;
  readonly approvedTotalCents: number;
  readonly payments: Readonly<Record<string, string>> | null;
  readonly paymentError: string | null;
  readonly followUpOf: string | null;
  readonly status: ReimbursementState;
}

export interface ReimbursementParameters {
  allowPartialApproval: boolean;
  retainDecisionsOnReturn: boolean;
  routing: 'single' | 'byCategory';
  categoryRoles: Readonly<Record<string, string>>;
  financeRole: string;
}

export interface ReimbursementTypes {
  record: Reimbursement;
  state: ReimbursementState;
  parameters: ReimbursementParameters;
  services: ScenarioServices;
}

type Context = TransitionContext<ReimbursementTypes>;

export const REIMBURSEMENTS = 'scenarioReimbursements';

function approverFor(
  category: string,
  applicant: string,
  parameters: ReimbursementParameters,
  services: ScenarioServices,
): string | undefined {
  const role =
    parameters.routing === 'byCategory'
      ? parameters.categoryRoles[category]
      : undefined;
  return role === undefined
    ? services.org.managerOf(applicant)
    : services.org.holderOf(role);
}

export const reimbursementApproval: Approval<ReimbursementTypes> =
  defineApproval<ReimbursementTypes, 'lineReview'>({
    name: 'reimbursement',
    applicant: (record) => record.applicantId,
    directory: directoryOf,
    freeze: ['lines'],
    flow: ['lineReview'],
    stages: {
      lineReview: stagesFor<ReimbursementTypes>().custom(
        itemizedPolicy,
        { partialSetting: 'partialAllowed' },
        {
          title: 'Line review',
          onEmpty: 'refuse',
          remindAfterHours: 24,
          assignees: () => [],
          subjects: ({ record, applicantId, parameters, services }) =>
            record.lines.map((line) => ({
              subject: line.id,
              assignee: approverFor(
                line.category,
                applicantId,
                parameters,
                services,
              ),
              data: {
                category: line.category,
                description: line.description,
                amountCents: line.amountCents,
              },
            })),
        },
      ),
    },
    // The rules a sheet is submitted under; later changes do not reach it.
    settings: ({ parameters }) => ({
      partialAllowed: parameters.allowPartialApproval,
      retainDecisions: parameters.retainDecisionsOnReturn,
    }),
    resubmit: {
      keep: (previous) =>
        previous.settings.retainDecisions === false ? 'none' : 'valid',
    },
    exits: {
      approved: 'approve',
      rejected: 'reject',
      returned: 'return',
      others: { partiallyApproved: 'approvePartially' },
    },
    notify: ({ task, services, reason }) =>
      services.outbox.send(
        task.assigneeId,
        `${reason === 'reminder' ? 'Reminder' : 'To decide'}: reimbursement ${task.recordId} / ${task.subject ?? ''}`,
        `${reason}:${task.id}`,
      ),
  });

/** What the line decisions came to, written by whichever exit the run ends at. */
function decided({
  input,
}: SetContext<ReimbursementTypes>): Record<string, unknown> {
  const result = (input.result ?? {}) as JsonObject;
  return {
    decisions: result.decisions ?? {},
    approvedTotalCents: Number(result.approvedTotalCents ?? 0),
  };
}

function isApplicant({ record, actor }: Context): GuardVerdict {
  return (
    actor.id === record.applicantId || {
      code: 'applicantOnly',
      message: 'Only the applicant can do this.',
    }
  );
}

function parseLines(value: JsonValue | undefined): LineContent[] | undefined {
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

/** Only returned lines may be corrected or dropped on a resubmission. */
function guardResubmission(context: Context): GuardVerdict {
  const own = isApplicant(context);
  if (own !== true) return own;
  const { record, input } = context;
  const touched = [
    ...(parseLines(input.lines) ?? []).map((line) => line.id),
    ...(Array.isArray(input.drop) ? input.drop.map(String) : []),
  ];
  for (const id of touched) {
    if (!record.lines.some((line) => line.id === id))
      return {
        kind: 'precondition',
        code: 'unknownLine',
        message: `No line "${id}".`,
      };
    if (record.decisions?.[id]?.outcome !== 'return')
      return {
        kind: 'precondition',
        code: 'notReturned',
        message: `Line "${id}" was not returned; only returned lines can be changed.`,
      };
  }
  return true;
}

/**
 * Pays every approved line under its own business key — the sheet, the
 * line and the content it was approved on — so a retry pays no line twice.
 */
const payApprovedLines: EffectDefinition<ReimbursementTypes> =
  defineEffect<ReimbursementTypes>({
    name: 'scenarioReimbursements.payApprovedLines',
    retry: {
      attempts: 2,
      shouldRetry: (error) => !(error instanceof PaymentDeclined),
    },
    onSuccess: 'markPaid',
    onFailure: 'markPaymentFailed',
    async run({ record, services }) {
      const payments: Record<string, string> = {};
      for (const [lineId, decision] of Object.entries(record.decisions ?? {})) {
        if (decision.outcome !== 'approve' || decision.approvedCents <= 0)
          continue;
        const key = `reimbursement:${String(record.id)}:${lineId}:${decision.hash ?? ''}`;
        payments[lineId] = (
          await services.external.pay(
            key,
            record.applicantId,
            decision.approvedCents,
          )
        ).reference;
      }
      return { payments };
    },
  });

export const reimbursementLifecycle: Lifecycle<ReimbursementTypes> =
  defineLifecycle({
    name: REIMBURSEMENTS,
    initial: 'draft',
    states: [
      'draft',
      reimbursementApproval.state('approving'),
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
    },
    transitions: {
      submit: { from: 'draft', to: 'approving', guard: isApplicant },
      resubmit: {
        from: 'returned',
        to: 'approving',
        guard: guardResubmission,
        validate: (input) =>
          input.lines === undefined || parseLines(input.lines)
            ? null
            : [
                {
                  field: 'lines',
                  message:
                    'Each line needs an id, a category, a description and an amount.',
                },
              ],
        set: ({ record, input }) => {
          const changes = parseLines(input.lines) ?? [];
          const dropped = Array.isArray(input.drop)
            ? input.drop.map(String)
            : [];
          const lines = record.lines
            .filter((line) => !dropped.includes(line.id))
            .map(
              (line) => changes.find((change) => change.id === line.id) ?? line,
            );
          if (!lines.length)
            throw new LifecycleError(
              'INVALID_STATE',
              'Keep at least one line.',
            );
          return { lines };
        },
      },
      // The run's ends.
      approve: {
        from: 'approving',
        to: 'approved',
        manual: false,
        set: decided,
      },
      approvePartially: {
        from: 'approving',
        to: 'partiallyApproved',
        manual: false,
        set: decided,
      },
      reject: {
        from: 'approving',
        to: 'rejected',
        manual: false,
        set: decided,
      },
      return: {
        from: 'approving',
        to: 'returned',
        manual: false,
        set: decided,
      },
      withdraw: {
        from: ['approving', 'returned'],
        to: 'withdrawn',
        guard: isApplicant,
      },
      markPaid: {
        from: ['approved', 'partiallyApproved'],
        to: 'paid',
        manual: false,
        set: ({ input }) => ({
          payments: input.payments ?? {},
          paymentError: null,
        }),
      },
      markPaymentFailed: {
        from: ['approved', 'partiallyApproved'],
        to: 'paymentFailed',
        manual: false,
        set: ({ input }) => ({
          paymentError: text(input.error) ?? 'Payment failed.',
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
          Object.values(record.decisions ?? {}).every(
            (decision) => decision.outcome === 'approve',
          )
            ? 'approved'
            : 'partiallyApproved',
      },
    },
    onEnter: {
      approved: [payApprovedLines],
      partiallyApproved: [payApprovedLines],
    },
  });

/**
 * Asks again for the lines a settled sheet rejected, as a new sheet: the
 * rejections stay on the old one as they were made.
 */
export async function requestRejectedLinesAgain(
  runtime: LifecycleRuntime,
  sheetId: RecordId,
  actor: string,
): Promise<RecordId> {
  return runtime.transaction(async (tx) => {
    const sheet = (await tx.read(REIMBURSEMENTS, sheetId)) as
      Reimbursement | undefined;
    if (!sheet || actor !== sheet.applicantId)
      throw new LifecycleError(
        'GUARD_REJECTED',
        'Only the applicant can ask again.',
      );
    const rejected = sheet.lines.filter(
      (line) => sheet.decisions?.[line.id]?.outcome === 'reject',
    );
    if (!rejected.length)
      throw new LifecycleError('INVALID_STATE', 'No line was rejected.');
    const { record } = await tx.create(
      REIMBURSEMENTS,
      {
        title: `${sheet.title} (again)`,
        applicantId: sheet.applicantId,
        lines: rejected,
        decisions: null,
        approvedTotalCents: 0,
        payments: null,
        paymentError: null,
        followUpOf: String(sheet.id),
      },
      { actor: { id: actor }, input: { followUpOf: String(sheet.id) } },
    );
    return record.id;
  });
}
