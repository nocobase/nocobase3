// Scenario 27: a payment request that is approved first and executed after.
// Approval is a fact on the record (`approvedAt`, `approvedBy`,
// `approvedSnapshot`); execution is the state — approved and waiting,
// executing, executed, failed, or reconciling when the outcome is unknown.
// No execution failure writes over the approval; a change to what was
// approved needs a new approval instead.
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
  type LifecycleRuntime,
  type RecordId,
  type SetContext,
  type TransitionContext,
  type TransitionHookContext,
} from '@nocobase/lifecycle';

import {
  PaymentDeclined,
  SCENARIO_COLLECTIONS,
  type ScenarioServices,
} from './services.js';

export type PaymentState =
  | 'draft'
  | 'pendingApproval'
  | 'approved'
  | 'executing'
  | 'reconciling'
  | 'executionFailed'
  | 'executed'
  | 'rejected'
  | 'withdrawn'
  | 'terminated';

/** Why an execution failed: each kind has its own way forward. */
export type FailureKind =
  /** The provider said no — insufficient balance. Retrying as is changes nothing. */
  | 'declined'
  /** The request no longer matches what was approved: it needs a new approval. */
  | 'contentChanged'
  /** Reconciliation found no payment: nothing happened, retrying is safe. */
  | 'notExecuted';

/** What an approval covers; a change to any of it voids the approval. */
export interface PaymentSnapshot extends JsonObject {
  payeeId: string;
  amountCents: number;
  installments: number;
}

export interface PaymentRequest extends LifecycleRecord {
  readonly title: string;
  readonly applicantId: string;
  readonly payeeId: string;
  readonly amountCents: number;
  readonly budgetCode: string;
  /** `immediate` pays as soon as it is approved; `scheduled` waits for a person or a date. */
  readonly executionMode?: 'immediate' | 'scheduled' | null;
  /** Paid in this many equal parts, one external payment each. */
  readonly installments?: number | null;
  readonly status: PaymentState;
  readonly statusChangedAt: string;
  readonly approverId?: string | null;
  readonly submittedSnapshot?: PaymentSnapshot | null;
  readonly approvedAt?: string | null;
  readonly approvedBy?: string | null;
  readonly approvedSnapshot?: PaymentSnapshot | null;
  /** Incremented by every new approval; part of the payment key. */
  readonly approvalRound?: number | null;
  readonly executeAt?: string | null;
  readonly paidCents?: number | null;
  readonly installmentsPaid?: number | null;
  readonly paymentRefs?: string[] | null;
  readonly failureKind?: FailureKind | null;
  readonly failureError?: string | null;
  readonly reservedCents?: number | null;
  readonly reservationStatus?:
    'held' | 'consumed' | 'released' | 'partiallyConsumed' | null;
}

export interface PaymentParameters {
  /** What each budget code may have reserved at once. */
  readonly budgetCents: number;
}

export interface PaymentTypes {
  record: PaymentRequest;
  state: PaymentState;
  parameters: PaymentParameters;
  services: ScenarioServices;
}

type Context = TransitionContext<PaymentTypes>;
type HookContext = TransitionHookContext<PaymentTypes>;

/**
 * An append-only ledger of budget reservations: a row per reservation and
 * per release. The scenario's record access can insert and list but not
 * update, and an append-only ledger also explains itself.
 */
export const PAYMENT_RESERVATIONS: string = 'scenarioPaymentReservations';

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function snapshotOf(record: PaymentRequest): PaymentSnapshot {
  return {
    payeeId: record.payeeId,
    amountCents: record.amountCents,
    installments: Math.max(1, num(record.installments ?? 1)),
  };
}

function sameContent(
  snapshot: PaymentSnapshot | null | undefined,
  record: PaymentRequest,
): boolean {
  if (!snapshot) return false;
  const now = snapshotOf(record);
  return (
    snapshot.payeeId === now.payeeId &&
    snapshot.amountCents === now.amountCents &&
    snapshot.installments === now.installments
  );
}

/** The amount of installment `k` (1-based); the last one takes the remainder. */
export function installmentCents(snapshot: PaymentSnapshot, k: number): number {
  const part = Math.floor(snapshot.amountCents / snapshot.installments);
  return k < snapshot.installments
    ? part
    : snapshot.amountCents - part * (snapshot.installments - 1);
}

/**
 * The business key of one external payment: the request, the approval it
 * executes, and the installment. Every attempt and every run paying the same
 * installment under the same approval sends the same key.
 */
export function paymentKey(record: PaymentRequest, k: number): string {
  return `payment:${String(record.id)}:r${num(record.approvalRound)}:${k}`;
}

async function budgetAvailable(
  services: ScenarioServices,
  budgetCode: string,
  budgetCents: number,
): Promise<number> {
  const rows = await services.records.list(
    PAYMENT_RESERVATIONS,
    (row) => row.budgetCode === budgetCode,
  );
  let held = 0;
  for (const row of rows)
    held +=
      row.kind === 'reserve' ? num(row.amountCents) : -num(row.amountCents);
  return budgetCents - held;
}

async function ledger(
  context: HookContext,
  kind: 'reserve' | 'release',
  amountCents: number,
): Promise<void> {
  if (amountCents <= 0) return;
  await context.services.records.insert(PAYMENT_RESERVATIONS, {
    requestId: String(context.record.id),
    budgetCode: context.record.budgetCode,
    kind,
    amountCents,
    transitionId: context.entry.id,
    at: context.now.toISOString(),
  });
}

/** Releases what is still held and was not paid out. */
async function releaseUnpaid(context: HookContext): Promise<void> {
  if (context.previous.reservationStatus !== 'held') return;
  await ledger(
    context,
    'release',
    num(context.previous.reservedCents) - num(context.previous.paidCents),
  );
}

function releasedStatus({ record }: Context): Record<string, unknown> {
  if (record.reservationStatus !== 'held') return {};
  return {
    reservationStatus:
      num(record.paidCents) > 0 ? 'partiallyConsumed' : 'released',
  };
}

function systemOnly({ actor }: Context): GuardVerdict {
  return (
    actor.system === true || {
      code: 'systemOnly',
      message: 'Only the system records this.',
    }
  );
}

function isApplicant({ actor, record }: Context): GuardVerdict {
  return (
    actor.id === record.applicantId || {
      code: 'applicantOnly',
      message: 'Only the applicant can do this.',
    }
  );
}

function isApprover({ actor, record, services }: Context): GuardVerdict {
  if (actor.id === record.applicantId)
    return {
      code: 'selfApproval',
      message: 'The applicant cannot approve their own payment.',
    };
  return (
    (actor.id === record.approverId && services.org.isActive(actor.id)) || {
      code: 'approverOnly',
      message: 'Only the assigned approver can decide.',
    }
  );
}

/** Finance staff who execute payments; approving one does not make you one. */
function isTreasurer({ actor, services }: Context): GuardVerdict {
  return (
    (services.org.isActive(actor.id) &&
      services.org.hasRole(actor.id, 'treasurer')) || {
      code: 'treasurerOnly',
      message: 'Only a treasurer can do this.',
    }
  );
}

function unchangedSinceApproval({ record }: Context): GuardVerdict {
  return (
    sameContent(record.approvedSnapshot, record) || {
      code: 'changedSinceApproval',
      message:
        'The request changed after it was approved; it needs a new approval.',
    }
  );
}

function all(...verdicts: GuardVerdict[]): GuardVerdict {
  return verdicts.find((verdict) => verdict !== true) ?? true;
}

function reasonRequired(input: JsonObject): InputProblem[] {
  return typeof input.reason === 'string' && input.reason.trim()
    ? []
    : [{ field: 'reason', message: 'Give a reason.' }];
}

/**
 * The record after one more installment is paid, and where it goes: on to
 * the next installment, or executed. Shared by a payment's own success and
 * by reconciliation that finds a payment whose answer was lost.
 */
function afterInstallment(
  context: SetContext<PaymentTypes>,
): Record<string, unknown> {
  const { record, input } = context;
  const paid = num(record.installmentsPaid) + 1;
  const done = context.to === 'executed';
  return {
    installmentsPaid: paid,
    paidCents: num(record.paidCents) + num(input.amountCents),
    paymentRefs: [
      ...(record.paymentRefs ?? []),
      typeof input.reference === 'string' ? input.reference : '',
    ],
    failureKind: null,
    failureError: null,
    ...(done ? { reservationStatus: 'consumed' } : {}),
  };
}

function nextAfterInstallment({ record }: Context): PaymentState {
  return num(record.installmentsPaid) + 1 < snapshotOf(record).installments
    ? 'executing'
    : 'executed';
}

function currentInstallment({ input, record }: Context): GuardVerdict {
  return (
    input.installment === num(record.installmentsPaid) + 1 || {
      code: 'staleResult',
      message: 'This result is for another installment.',
    }
  );
}

// ---------------------------------------------------------------------------
// Effects

/**
 * An execution failure whose kind the failure continuation reads back. The
 * continuation receives only the message (`{ error }`), so the kind leads it.
 * `unknown` means the call may have gone through: worth retrying under the
 * same key, and reconciled once the retries are spent.
 */
export class PaymentExecutionError extends Error {
  public readonly kind: FailureKind | 'unknown';

  public constructor(kind: FailureKind | 'unknown', message: string) {
    super(`${kind}: ${message}`);
    this.name = 'PaymentExecutionError';
    this.kind = kind;
  }
}

function kindOf(error: unknown): FailureKind | 'unknown' {
  const text = typeof error === 'string' ? error : '';
  for (const kind of ['declined', 'contentChanged', 'notExecuted'] as const)
    if (text.startsWith(`${kind}:`)) return kind;
  return 'unknown';
}

export const executePayment: EffectDefinition<PaymentTypes> =
  defineEffect<PaymentTypes>({
    name: 'paymentRequests.executePayment',
    retry: {
      attempts: 3,
      backoffMs: 30_000,
      factor: 2,
      // A decline or a changed request is an answer; only an outage or a
      // lost response is worth another try.
      shouldRetry: (error) =>
        !(error instanceof PaymentExecutionError) || error.kind === 'unknown',
    },
    timeoutMs: 10_000,
    onSuccess: 'paid',
    onFailure: 'payFailed',
    run: async ({ record, services }) => {
      // Checked again when the money moves, not only when the transition
      // was decided: the record may have been edited in between.
      if (!sameContent(record.approvedSnapshot, record))
        throw new PaymentExecutionError(
          'contentChanged',
          'The request no longer matches its approval.',
        );
      const snapshot = snapshotOf(record);
      const k = num(record.installmentsPaid) + 1;
      const amountCents = installmentCents(snapshot, k);
      try {
        const { reference } = await services.external.pay(
          paymentKey(record, k),
          record.payeeId,
          amountCents,
        );
        return { reference, installment: k, amountCents };
      } catch (error) {
        if (error instanceof PaymentDeclined)
          throw new PaymentExecutionError('declined', error.message);
        throw new PaymentExecutionError(
          'unknown',
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });

export const reconcilePayment: EffectDefinition<PaymentTypes> =
  defineEffect<PaymentTypes>({
    name: 'paymentRequests.reconcilePayment',
    retry: { attempts: 5, backoffMs: 60_000, factor: 2 },
    onSuccess: 'reconciled',
    run: async ({ record, services }) => {
      const k = num(record.installmentsPaid) + 1;
      const found = await services.external.findPayment(paymentKey(record, k));
      return found
        ? {
            found: true,
            reference: found.reference,
            installment: k,
            amountCents: installmentCents(snapshotOf(record), k),
          }
        : { found: false, installment: k };
    },
  });

export const notifyPaymentApprover: EffectDefinition<PaymentTypes> =
  defineEffect<PaymentTypes>({
    name: 'paymentRequests.notifyApprover',
    run: async ({ record, services, idempotencyKey }) => {
      const to = record.approverId ?? '';
      await services.outbox.send(
        to,
        `Payment to approve: ${record.title}`,
        idempotencyKey,
      );
      return { to };
    },
  });

export const notifyPaymentApplicant: EffectDefinition<PaymentTypes> =
  defineEffect<PaymentTypes>({
    name: 'paymentRequests.notifyApplicant',
    run: async ({ record, services, to, idempotencyKey }) => {
      await services.outbox.send(
        record.applicantId,
        `Payment ${to}: ${record.title}`,
        idempotencyKey,
      );
      return { to: record.applicantId };
    },
  });

// ---------------------------------------------------------------------------
// The lifecycle

/**
 * Scenario 27: a payment approved, then executed.
 *
 * Submitting reserves the amount against its budget; rejecting, withdrawing
 * and terminating release what was not paid. An approved request is paid at
 * once (`immediate`) or waits in `approved` until a treasurer executes it or
 * its chosen `executeAt` passes ({@link executeDuePayments}). Execution pays
 * each installment under a business key; a decline, a changed request and an
 * unknown outcome each lead somewhere different, and none of them touches
 * the approval.
 */
export const paymentRequestLifecycle: Lifecycle<PaymentTypes> =
  defineLifecycle<PaymentTypes>({
    name: 'paymentRequests',
    collection: SCENARIO_COLLECTIONS.paymentRequests,
    initial: 'draft',
    states: [
      'draft',
      'pendingApproval',
      'approved',
      'executing',
      'reconciling',
      'executionFailed',
      { name: 'executed', final: true },
      { name: 'rejected', final: true },
      { name: 'withdrawn', final: true },
      { name: 'terminated', final: true },
    ],
    parameters: { budgetCents: 10_000_000 },
    transitions: {
      submit: {
        title: 'Submit',
        from: 'draft',
        to: 'pendingApproval',
        guard: async (context) => {
          const applicant = isApplicant(context);
          if (applicant !== true) return applicant;
          const available = await budgetAvailable(
            context.services,
            context.record.budgetCode,
            context.parameters.budgetCents,
          );
          return (
            available >= context.record.amountCents || {
              code: 'budgetExhausted',
              message: `Only ${available} cents of the budget are left.`,
            }
          );
        },
        set: ({ record, services }) => ({
          approverId: services.org.holderOf('financeApprover') ?? null,
          submittedSnapshot: snapshotOf(record),
          reservedCents: record.amountCents,
          reservationStatus: 'held',
          approvalRound: num(record.approvalRound) + 1,
        }),
        // The reservation commits with the submission, or neither does.
        onTransition: (context) =>
          ledger(context, 'reserve', context.record.amountCents),
      },
      withdraw: {
        title: 'Withdraw',
        from: ['draft', 'pendingApproval'],
        to: 'withdrawn',
        guard: isApplicant,
        set: releasedStatus,
        onTransition: releaseUnpaid,
      },
      approve: {
        title: 'Approve',
        from: 'pendingApproval',
        to: ['executing', 'approved'],
        guard: (context) =>
          all(
            isApprover(context),
            sameContent(context.record.submittedSnapshot, context.record) || {
              code: 'changedSinceSubmit',
              message: 'The request changed after it was submitted.',
            },
          ),
        route: ({ record }) =>
          record.executionMode === 'scheduled' ? 'approved' : 'executing',
        set: ({ actor, record, now }) => ({
          approvedAt: now.toISOString(),
          approvedBy: actor.id,
          approvedSnapshot: snapshotOf(record),
        }),
      },
      reject: {
        title: 'Reject',
        from: 'pendingApproval',
        to: 'rejected',
        guard: isApprover,
        validate: reasonRequired,
        set: releasedStatus,
        onTransition: releaseUnpaid,
      },

      schedule: {
        title: 'Choose when to pay',
        from: 'approved',
        to: 'approved',
        guard: isTreasurer,
        validate: (input) =>
          typeof input.executeAt === 'string' &&
          !Number.isNaN(Date.parse(input.executeAt))
            ? null
            : [{ field: 'executeAt', message: 'Give a date and time.' }],
        accept: ['executeAt'],
      },
      execute: {
        title: 'Pay now',
        from: 'approved',
        to: 'executing',
        guard: (context) => {
          const due =
            context.actor.system === true &&
            typeof context.record.executeAt === 'string' &&
            context.record.executeAt <= context.now.toISOString();
          return all(
            due || isTreasurer(context),
            unchangedSinceApproval(context),
          );
        },
      },

      paid: {
        title: 'Installment paid',
        from: 'executing',
        to: ['executing', 'executed'],
        guard: (context) =>
          all(systemOnly(context), currentInstallment(context)),
        route: nextAfterInstallment,
        set: afterInstallment,
      },
      payFailed: {
        title: 'Payment failed',
        from: 'executing',
        to: ['executionFailed', 'reconciling'],
        guard: systemOnly,
        route: ({ input }) =>
          kindOf(input.error) === 'unknown' ? 'reconciling' : 'executionFailed',
        set: ({ input, to }) => ({
          failureKind: to === 'reconciling' ? null : kindOf(input.error),
          failureError: typeof input.error === 'string' ? input.error : null,
        }),
      },
      reconciled: {
        title: 'Outcome reconciled',
        from: 'reconciling',
        to: ['executing', 'executed', 'executionFailed'],
        guard: (context) =>
          all(systemOnly(context), currentInstallment(context)),
        route: (context) =>
          context.input.found === true
            ? nextAfterInstallment(context)
            : 'executionFailed',
        set: (context) =>
          context.input.found === true
            ? afterInstallment(context)
            : {
                failureKind: 'notExecuted',
                failureError: 'Reconciliation found no payment.',
              },
      },
      reconcileAgain: {
        title: 'Reconcile again',
        // When reconciliation itself keeps failing, a treasurer starts it
        // again; nothing else may leave a payment whose outcome is unknown.
        from: 'reconciling',
        to: 'reconciling',
        guard: isTreasurer,
      },

      retryExecution: {
        title: 'Retry the payment',
        from: 'executionFailed',
        to: 'executing',
        guard: (context) =>
          all(
            isTreasurer(context),
            context.record.failureKind !== 'contentChanged' || {
              code: 'needsReapproval',
              message: 'The request changed; it needs a new approval.',
            },
            unchangedSinceApproval(context),
          ),
      },
      requestReapproval: {
        title: 'Ask for a new approval',
        from: ['approved', 'executionFailed'],
        to: 'pendingApproval',
        guard: async (context) => {
          if (isApplicant(context) !== true && isTreasurer(context) !== true)
            return {
              code: 'applicantOrTreasurer',
              message: 'Only the applicant or a treasurer can ask for this.',
            };
          if (num(context.record.paidCents) > 0)
            return {
              code: 'partlyPaid',
              message:
                'Part of it is paid; terminate it and submit the rest anew.',
            };
          const available = await budgetAvailable(
            context.services,
            context.record.budgetCode,
            context.parameters.budgetCents,
          );
          return (
            available + num(context.record.reservedCents) >=
              context.record.amountCents || {
              code: 'budgetExhausted',
              message: `Only ${available} cents of the budget are left.`,
            }
          );
        },
        validate: reasonRequired,
        // The earlier approval stays in the log; the record carries the one
        // in force, which is none until the new decision.
        set: ({ record, services }) => ({
          approverId: services.org.holderOf('financeApprover') ?? null,
          submittedSnapshot: snapshotOf(record),
          approvedAt: null,
          approvedBy: null,
          approvedSnapshot: null,
          approvalRound: num(record.approvalRound) + 1,
          failureKind: null,
          failureError: null,
          executeAt: null,
          reservedCents: record.amountCents,
          reservationStatus: 'held',
        }),
        onTransition: async (context) => {
          await releaseUnpaid(context);
          await ledger(context, 'reserve', context.record.amountCents);
        },
      },
      terminate: {
        title: 'Terminate',
        // Finance may stop an approved payment that has not finished; the
        // applicant's say ends with the approval. Not while a payment is in
        // flight or its outcome is unknown.
        from: ['approved', 'executionFailed'],
        to: 'terminated',
        guard: (context) =>
          isTreasurer(context) === true ||
          context.actor.id === context.record.approvedBy || {
            code: 'financeOnly',
            message: 'Only a treasurer or the approver can terminate.',
          },
        validate: reasonRequired,
        set: releasedStatus,
        onTransition: releaseUnpaid,
      },
    },
    onEnter: {
      pendingApproval: [notifyPaymentApprover],
      executing: [executePayment],
      reconciling: [reconcilePayment],
      executionFailed: [notifyPaymentApplicant],
      executed: [notifyPaymentApplicant],
    },
  });

/** What one sweep of {@link executeDuePayments} did. */
export interface DueExecutionResult {
  readonly executed: RecordId[];
  /** Records due but refused, with the reason — a changed request, say. */
  readonly refused: { readonly id: RecordId; readonly reason: string }[];
}

/**
 * Executes approved payments whose chosen `executeAt` has passed. A trigger
 * cannot do this — its `after` reads the parameters, not the record — so,
 * like a deadline, it is a sweep run on a schedule. The requestId names the
 * date it was due, so a second instance sweeping at once replays.
 */
export async function executeDuePayments(
  runtime: LifecycleRuntime,
  services: ScenarioServices,
  now: Date,
): Promise<DueExecutionResult> {
  const cutoff = now.toISOString();
  const due = await services.records.list(
    SCENARIO_COLLECTIONS.paymentRequests,
    (record) =>
      record.status === 'approved' &&
      typeof record.executeAt === 'string' &&
      record.executeAt <= cutoff,
  );
  const result: DueExecutionResult = { executed: [], refused: [] };
  for (const record of due) {
    try {
      const fired = await runtime.fire(
        paymentRequestLifecycle.name,
        record.id,
        'execute',
        {
          actor: SYSTEM_ACTOR,
          requestId: `execute:${String(record.id)}:${String(record.executeAt)}`,
        },
      );
      if (!fired.replayed) result.executed.push(record.id);
    } catch (error) {
      if (
        !(error instanceof LifecycleError) ||
        !['INVALID_STATE', 'GUARD_REJECTED', 'CONFLICT'].includes(error.code)
      )
        throw error;
      result.refused.push({ id: record.id, reason: error.message });
    }
  }
  return result;
}
