// Scenario 18: a supplier onboarding that mixes human decisions (legal
// review, risk review), a system task (a company registry check), an
// external event (the deposit payment) and an execution step (creating the
// supplier account). The approval conclusion — `approvedAt` and
// `approvalBasis` — is a fact on the record, written once by whichever path
// concluded it; execution progress is the state, and a failed execution
// never touches the conclusion.
import {
  defineEffect,
  defineLifecycle,
  type EffectDefinition,
  type GuardVerdict,
  type InputProblem,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import { SCENARIO_COLLECTIONS, type ScenarioServices } from './services.js';

export type SupplierState =
  | 'legalReview'
  | 'verifying'
  | 'manualVerification'
  | 'riskReview'
  | 'riskReviewOverdue'
  | 'awaitingDeposit'
  | 'creatingAccount'
  | 'accountFailed'
  | 'active'
  | 'rejected'
  | 'withdrawn'
  | 'cancelled';

export type RiskLevel = 'low' | 'high';

export interface SupplierOnboarding extends LifecycleRecord {
  readonly name: string;
  readonly registrationNo: string;
  /** The supplier's contact, who submitted the materials. */
  readonly applicantId: string;
  readonly status: SupplierState;
  readonly statusChangedAt: string;
  /** Incremented by every registry check, so a late result can be told from the current one. */
  readonly verificationRound?: number | null;
  readonly riskLevel?: RiskLevel | null;
  readonly riskCheckedAt?: string | null;
  readonly verificationError?: string | null;
  readonly riskReviewerId?: string | null;
  readonly legalApprovedBy?: string | null;
  readonly legalApprovedAt?: string | null;
  /** The approval conclusion: when it was reached, and on what basis. */
  readonly approvedAt?: string | null;
  readonly approvalBasis?: JsonObject | null;
  readonly depositRef?: string | null;
  readonly depositCents?: number | null;
  readonly account?: string | null;
  readonly accountError?: string | null;
}

export interface SupplierParameters {
  /** Days a risk reviewer may sit on a review before being reminded. */
  readonly remindAfterDays: number;
  /** Days after the reminder before the review passes to the head of risk. */
  readonly escalateAfterDays: number;
  /** The deposit an approved supplier pays before its account is created. */
  readonly depositCents: number;
  /** Days an approved supplier has to pay the deposit. */
  readonly depositWaitDays: number;
  /** Whether a supplier exempted by a low-risk check pays a deposit too. */
  readonly lowRiskNeedsDeposit: boolean;
}

export interface SupplierTypes {
  record: SupplierOnboarding;
  state: SupplierState;
  parameters: SupplierParameters;
  services: ScenarioServices;
}

type Context = TransitionContext<SupplierTypes>;

/** The rule a low-risk registry result is exempted from risk review under. */
export const LOW_RISK_EXEMPTION: string = 'supplier.lowRiskRegistryCheck/v1';

const DAY = 86_400_000;

function round(record: SupplierOnboarding): number {
  return Number(record.verificationRound ?? 0);
}

function systemOnly({ actor }: Context): GuardVerdict {
  return (
    actor.system === true || {
      code: 'systemOnly',
      message: 'Only the system records this.',
    }
  );
}

function hasRole(role: string): (context: Context) => GuardVerdict {
  return ({ actor, record, services }) => {
    if (actor.id === record.applicantId)
      return {
        code: 'selfReview',
        message: 'The applicant cannot review their own onboarding.',
      };
    return (
      (services.org.isActive(actor.id) &&
        services.org.hasRole(actor.id, role)) || {
        code: 'roleRequired',
        message: `Only an active holder of "${role}" can do this.`,
      }
    );
  };
}

function isRiskReviewer({ actor, record, services }: Context): GuardVerdict {
  return (
    (actor.id === record.riskReviewerId && services.org.isActive(actor.id)) || {
      code: 'riskReviewerOnly',
      message: 'Only the assigned risk reviewer can decide.',
    }
  );
}

function reasonRequired(input: JsonObject): InputProblem[] {
  return typeof input.reason === 'string' && input.reason.trim()
    ? []
    : [{ field: 'reason', message: 'Give a reason.' }];
}

/**
 * Where an approved supplier goes next: straight to account creation when
 * the deposit is already in, or when this basis needs none.
 */
function afterApproval(
  record: SupplierOnboarding,
  needsDeposit: boolean,
): SupplierState {
  return needsDeposit && !record.depositRef
    ? 'awaitingDeposit'
    : 'creatingAccount';
}

/** Where a risk level found by the registry or by a person leads. */
function routeByRisk(context: Context, risk: unknown): SupplierState {
  if (risk === 'high') return 'riskReview';
  return afterApproval(context.record, context.parameters.lowRiskNeedsDeposit);
}

/**
 * The approval conclusion for a supplier that skips risk review, with the
 * rule and the evidence that let it skip, so the history can explain an
 * approval nobody clicked.
 */
function exemption(
  context: Context,
  evidence: JsonObject,
): Record<string, unknown> {
  return {
    approvedAt: context.now.toISOString(),
    approvalBasis: {
      kind: 'exemption',
      rule: LOW_RISK_EXEMPTION,
      legalApprovedBy: context.record.legalApprovedBy ?? null,
      round: round(context.record),
      evidence,
    },
  };
}

// ---------------------------------------------------------------------------
// Effects

/** Thrown by the registry check so the failure continuation knows its round. */
class RegistryCheckFailed extends Error {
  public constructor(checkRound: number, cause: unknown) {
    super(
      `round=${checkRound}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'RegistryCheckFailed';
  }
}

/** The round a failure message names, as `RegistryCheckFailed` wrote it. */
function failedRound(error: unknown): number | null {
  const match = /^round=(\d+):/.exec(typeof error === 'string' ? error : '');
  return match ? Number(match[1]) : null;
}

export const checkRegistry: EffectDefinition<SupplierTypes> =
  defineEffect<SupplierTypes>({
    name: 'supplierOnboardings.checkRegistry',
    // Three tries a minute, then two minutes apart; the attempts are fixed in
    // source, not an administrator parameter.
    retry: { attempts: 3, backoffMs: 60_000, factor: 2 },
    onSuccess: 'registryChecked',
    onFailure: 'verificationFailed',
    run: async ({ record, services }) => {
      // The round is read when the attempt starts, so a result that comes
      // back after the information changed names the round it checked.
      const checkRound = round(record);
      try {
        const { risk } = await services.external.checkCompany(
          record.registrationNo,
        );
        return {
          risk,
          round: checkRound,
          registrationNo: record.registrationNo,
        };
      } catch (error) {
        throw new RegistryCheckFailed(checkRound, error);
      }
    },
  });

export const notifyRiskReviewer: EffectDefinition<SupplierTypes> =
  defineEffect<SupplierTypes>({
    name: 'supplierOnboardings.notifyRiskReviewer',
    run: async ({ record, services }) => {
      const to = record.riskReviewerId ?? '';
      // Keyed by round and reviewer: a self-transition re-entering the state
      // runs this again, and must not send the same message twice.
      await services.outbox.send(
        to,
        `Risk review: ${record.name}`,
        `supplier:${String(record.id)}:riskReview:${round(record)}:${to}`,
      );
      return { to };
    },
  });

export const remindRiskReviewer: EffectDefinition<SupplierTypes> =
  defineEffect<SupplierTypes>({
    name: 'supplierOnboardings.remindRiskReviewer',
    run: async ({ record, services }) => {
      const to = record.riskReviewerId ?? '';
      await services.outbox.send(
        to,
        `Overdue risk review: ${record.name}`,
        `supplier:${String(record.id)}:overdue:${round(record)}:${to}`,
      );
      return { to };
    },
  });

export const createAccount: EffectDefinition<SupplierTypes> =
  defineEffect<SupplierTypes>({
    name: 'supplierOnboardings.createAccount',
    retry: { attempts: 3, backoffMs: 30_000, factor: 2 },
    onSuccess: 'accountCreated',
    onFailure: 'accountCreationFailed',
    run: async ({ record, services }) => {
      // One key per supplier, not the run's own key: retryAccount starts a
      // new run, and a key per run would let it open a second account if an
      // earlier one went through without its answer.
      const { account } = await services.external.createSupplierAccount(
        `supplier-account:${String(record.id)}`,
        record.name,
      );
      return { account };
    },
  });

export const notifySupplierOps: EffectDefinition<SupplierTypes> =
  defineEffect<SupplierTypes>({
    name: 'supplierOnboardings.notifySupplierOps',
    run: async ({ record, services, idempotencyKey }) => {
      const to = services.org.holderOf('supplierOps') ?? '';
      await services.outbox.send(
        to,
        `Supplier account creation failed: ${record.name}`,
        idempotencyKey,
      );
      return { to };
    },
  });

// ---------------------------------------------------------------------------
// The lifecycle

const reviewing: SupplierState[] = ['riskReview', 'riskReviewOverdue'];

/** States in which the supplier's deposit may arrive and is kept for later. */
const depositOpen: SupplierState[] = [
  'verifying',
  'manualVerification',
  'riskReview',
  'riskReviewOverdue',
  'awaitingDeposit',
];

/**
 * Scenario 18: supplier onboarding.
 *
 * Legal reviews the materials, then the registry is checked by an effect: a
 * low risk is approved by exemption under {@link LOW_RISK_EXEMPTION}, a high
 * risk goes to a risk reviewer, and a check that keeps failing goes to a
 * person to verify by hand. Once approved the supplier pays a deposit, an
 * external event, and the account is created by another effect; a failed
 * creation waits for operations to retry it and leaves the approval as it is.
 */
export const supplierOnboardingLifecycle: Lifecycle<SupplierTypes> =
  defineLifecycle<SupplierTypes>({
    name: 'supplierOnboardings',
    collection: SCENARIO_COLLECTIONS.supplierOnboardings,
    initial: 'legalReview',
    states: [
      'legalReview',
      'verifying',
      'manualVerification',
      'riskReview',
      'riskReviewOverdue',
      'awaitingDeposit',
      'creatingAccount',
      'accountFailed',
      { name: 'active', final: true },
      { name: 'rejected', final: true },
      { name: 'withdrawn', final: true },
      { name: 'cancelled', final: true },
    ],
    parameters: {
      remindAfterDays: 2,
      escalateAfterDays: 3,
      depositCents: 1_000_000,
      depositWaitDays: 14,
      lowRiskNeedsDeposit: false,
    },
    transitions: {
      legalApprove: {
        title: 'Legal approves the materials',
        from: 'legalReview',
        to: 'verifying',
        guard: hasRole('legal'),
        set: ({ actor, record, now }) => ({
          legalApprovedBy: actor.id,
          legalApprovedAt: now.toISOString(),
          verificationRound: round(record) + 1,
        }),
      },
      legalReject: {
        title: 'Legal rejects',
        from: 'legalReview',
        to: 'rejected',
        guard: hasRole('legal'),
        validate: reasonRequired,
      },

      // The registry check's continuations. Both compare the round the check
      // ran for with the record's, so a late answer to an earlier check is
      // refused instead of deciding the current one.
      registryChecked: {
        title: 'Registry check finished',
        from: 'verifying',
        to: ['riskReview', 'awaitingDeposit', 'creatingAccount'],
        guard: (context) => {
          const system = systemOnly(context);
          if (system !== true) return system;
          return (
            (context.input.round === round(context.record) &&
              context.input.registrationNo ===
                context.record.registrationNo) || {
              code: 'staleResult',
              message: 'This result answers an earlier check.',
            }
          );
        },
        route: (context) => routeByRisk(context, context.input.risk),
        set: (context) => ({
          riskLevel: context.input.risk,
          riskCheckedAt: context.now.toISOString(),
          verificationError: null,
          riskReviewerId:
            context.to === 'riskReview'
              ? (context.services.org.holderOf('riskOfficer') ?? null)
              : null,
          ...(context.to === 'riskReview'
            ? {}
            : exemption(context, {
                source: 'registry',
                risk: context.input.risk ?? null,
                registrationNo: context.record.registrationNo,
                checkedAt: context.now.toISOString(),
              })),
        }),
      },
      verificationFailed: {
        title: 'Registry check failed',
        from: 'verifying',
        to: 'manualVerification',
        guard: (context) => {
          const system = systemOnly(context);
          if (system !== true) return system;
          return (
            failedRound(context.input.error) === round(context.record) || {
              code: 'staleResult',
              message: 'This failure belongs to an earlier check.',
            }
          );
        },
        set: ({ input }) => ({
          verificationError:
            typeof input.error === 'string' ? input.error : null,
        }),
      },
      verifyManually: {
        title: 'Verify by hand',
        from: 'manualVerification',
        to: ['riskReview', 'awaitingDeposit', 'creatingAccount'],
        guard: hasRole('riskOfficer'),
        validate: (input) => [
          ...(input.risk === 'low' || input.risk === 'high'
            ? []
            : [
                {
                  field: 'risk',
                  message: 'Say whether the risk is low or high.',
                },
              ]),
          ...(typeof input.evidence === 'string' && input.evidence.trim()
            ? []
            : [{ field: 'evidence', message: 'Say what was checked.' }]),
        ],
        route: (context) => routeByRisk(context, context.input.risk),
        set: (context) => ({
          riskLevel: context.input.risk,
          riskCheckedAt: context.now.toISOString(),
          riskReviewerId:
            context.to === 'riskReview'
              ? (context.services.org.holderOf('riskOfficer') ?? null)
              : null,
          ...(context.to === 'riskReview'
            ? {}
            : exemption(context, {
                source: 'manual',
                verifiedBy: context.actor.id,
                risk: context.input.risk ?? null,
                note: context.input.evidence ?? null,
              })),
        }),
      },
      recheck: {
        title: 'Risk information changed: check again',
        // Not from creatingAccount: the account is being opened on the
        // approval as it stands, and its outcome comes first.
        from: [
          'manualVerification',
          'riskReview',
          'riskReviewOverdue',
          'awaitingDeposit',
          'accountFailed',
        ],
        to: 'verifying',
        guard: (context) =>
          context.actor.system === true || hasRole('riskOfficer')(context),
        validate: reasonRequired,
        accept: ['registrationNo'],
        // The approval was given on the old information, so it no longer
        // stands; the log keeps the entry that granted it.
        set: ({ record }) => ({
          verificationRound: round(record) + 1,
          riskReviewerId: null,
          approvedAt: null,
          approvalBasis: null,
        }),
      },

      riskApprove: {
        title: 'Risk approves',
        from: reviewing,
        to: ['awaitingDeposit', 'creatingAccount'],
        guard: isRiskReviewer,
        route: ({ record }) => afterApproval(record, true),
        set: ({ actor, record, now }) => ({
          approvedAt: now.toISOString(),
          approvalBasis: {
            kind: 'decision',
            decidedBy: actor.id,
            legalApprovedBy: record.legalApprovedBy ?? null,
            round: round(record),
            risk: record.riskLevel ?? null,
          },
        }),
      },
      riskReject: {
        title: 'Risk rejects',
        from: reviewing,
        to: 'rejected',
        guard: isRiskReviewer,
        validate: reasonRequired,
      },
      remindRiskReviewer: {
        title: 'Remind the risk reviewer',
        from: 'riskReview',
        to: 'riskReviewOverdue',
        guard: systemOnly,
      },
      escalateRiskReview: {
        title: 'Pass the review to the head of risk',
        from: 'riskReviewOverdue',
        to: 'riskReviewOverdue',
        guard: (context) => {
          const system = systemOnly(context);
          if (system !== true) return system;
          const head = context.services.org.holderOf('riskHead');
          return (
            (head !== undefined && head !== context.record.riskReviewerId) || {
              code: 'topReviewer',
              message: 'The head of risk already has the review.',
            }
          );
        },
        set: ({ services }) => ({
          riskReviewerId: services.org.holderOf('riskHead') ?? null,
        }),
      },

      // The deposit is an external event: the payment provider's callback
      // fires it with its event id as the requestId. It may arrive before
      // the approval; it is then kept and the state stays where it is.
      depositReceived: {
        title: 'Deposit received',
        from: depositOpen,
        to: [...depositOpen, 'creatingAccount'],
        guard: (context) => {
          const system = systemOnly(context);
          if (system !== true) return system;
          return (
            Number(context.input.amountCents) >=
              context.parameters.depositCents || {
              code: 'depositTooSmall',
              message: 'The deposit is less than required.',
            }
          );
        },
        validate: (input) =>
          typeof input.depositRef === 'string' &&
          typeof input.amountCents === 'number'
            ? null
            : 'A deposit needs a reference and an amount.',
        route: ({ record }) =>
          record.status === 'awaitingDeposit'
            ? 'creatingAccount'
            : record.status,
        set: ({ input }) => ({
          depositRef: input.depositRef,
          depositCents: input.amountCents,
        }),
      },
      expireDeposit: {
        title: 'Deposit not paid in time',
        from: 'awaitingDeposit',
        to: 'cancelled',
        guard: systemOnly,
      },

      accountCreated: {
        title: 'Account created',
        from: 'creatingAccount',
        to: 'active',
        guard: systemOnly,
        accept: ['account'],
        set: () => ({ accountError: null }),
      },
      accountCreationFailed: {
        title: 'Account creation failed',
        from: 'creatingAccount',
        to: 'accountFailed',
        guard: systemOnly,
        set: ({ input }) => ({
          accountError: typeof input.error === 'string' ? input.error : null,
        }),
      },
      retryAccount: {
        title: 'Create the account again',
        from: 'accountFailed',
        to: 'creatingAccount',
        guard: hasRole('supplierOps'),
      },
      abandon: {
        title: 'Give up on the onboarding',
        from: 'accountFailed',
        to: 'cancelled',
        guard: hasRole('supplierOps'),
        validate: reasonRequired,
      },

      withdraw: {
        title: 'Withdraw',
        from: [
          'legalReview',
          'verifying',
          'manualVerification',
          'riskReview',
          'riskReviewOverdue',
          'awaitingDeposit',
        ],
        to: 'withdrawn',
        guard: ({ actor, record }) =>
          actor.id === record.applicantId || {
            code: 'applicantOnly',
            message: 'Only the supplier can withdraw.',
          },
      },
    },
    onEnter: {
      verifying: [checkRegistry],
      riskReview: [notifyRiskReviewer],
      riskReviewOverdue: [remindRiskReviewer],
      creatingAccount: [createAccount],
      accountFailed: [notifySupplierOps],
    },
    triggers: {
      remindIdleReview: {
        transition: 'remindRiskReviewer',
        when: 'riskReview',
        after: ({ remindAfterDays }) => remindAfterDays * DAY,
      },
      escalateIdleReview: {
        transition: 'escalateRiskReview',
        when: 'riskReviewOverdue',
        after: ({ escalateAfterDays }) => escalateAfterDays * DAY,
      },
      expireUnpaidDeposit: {
        transition: 'expireDeposit',
        when: 'awaitingDeposit',
        after: ({ depositWaitDays }) => depositWaitDays * DAY,
      },
    },
  });
