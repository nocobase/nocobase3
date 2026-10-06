import {
  defineEffect,
  defineLifecycle,
  SYSTEM_ACTOR,
  type EffectDefinition,
  type GuardVerdict,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
  type LifecycleRuntime,
  type LifecycleTransaction,
  type RecordId,
  type TransitionContext,
} from '@nocobase/lifecycle';

import {
  defineApproval,
  rowsOf,
  stagesFor,
  type Approval,
  type Row,
} from '@nocobase/app-plugin-approval/server';
import { directoryOf, text, type ScenarioServices } from './services.js';

// Scenario 18: supplier onboarding mixes two human decisions,
// a system check, an external event and an execution step.
//
//   draft → legalReview → verifying → (low: exemption | high: riskReview)
//         → awaitingDeposit → creatingAccount → active | accountFailed
//
// The two decisions are two approvals, each providing the state the
// onboarding waits in while it decides: their stages are their runs', and
// their people, reminders and escalation are tasks, so waiting or
// escalating never moves the onboarding. Each run's end fires the
// onboarding's own exit, which records the approval fact. The registry
// check and the account are effects, as before. The deposit is an external event that
// lands in a ledger whenever it comes — early, twice, or on time — and moves
// the onboarding only when the onboarding is waiting for it. The approval
// fact stays on the record, written by whichever path reached it.

export type SupplierState =
  | 'draft'
  | 'legalReview'
  | 'verifying'
  | 'manualVerification'
  | 'riskReview'
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
  readonly applicantId: string;
  readonly verificationRound: number;
  readonly riskLevel: RiskLevel | null;
  readonly verificationError: string | null;
  readonly legalApprovedBy: string | null;
  readonly approvedAt: string | null;
  readonly approvalBasis: JsonObject | null;
  readonly depositRef: string | null;
  readonly account: string | null;
  readonly accountError: string | null;
  readonly status: SupplierState;
}

export interface SupplierParameters {
  readonly depositCents: number;
  readonly depositWaitDays: number;
  readonly lowRiskNeedsDeposit: boolean;
}

export interface SupplierTypes {
  record: SupplierOnboarding;
  state: SupplierState;
  parameters: SupplierParameters;
  services: ScenarioServices;
}

type Context = TransitionContext<SupplierTypes>;

export const SUPPLIERS = 'scenarioSuppliers';
export const SUPPLIER_DEPOSITS = 'scenarioSupplierDeposits';
export const LOW_RISK_EXEMPTION: string = 'supplier.lowRiskRegistryCheck/v1';

const DAY = 86_400_000;
const stage = stagesFor<SupplierTypes>();

const notify = ({
  task,
  services,
  reason,
}: {
  task: { assigneeId: string; recordId: string; id: string };
  services: ScenarioServices;
  reason: string;
}) =>
  services.outbox.send(
    task.assigneeId,
    reason === 'reminder'
      ? `Overdue review: supplier ${task.recordId}`
      : `Review supplier ${task.recordId}`,
    `${reason}:${task.id}`,
  );

export const supplierLegalApproval: Approval<SupplierTypes> = defineApproval<
  SupplierTypes,
  'legalReview'
>({
  name: 'supplierLegal',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  freeze: ['name', 'registrationNo'],
  flow: ['legalReview'],
  stages: {
    legalReview: stage.first({
      title: 'Legal review',
      assignees: ({ services }) => services.org.holders('legal'),
    }),
  },
  exits: { approved: 'legalApproved', rejected: 'legalRejected' },
  notify,
});

export const supplierRiskApproval: Approval<SupplierTypes> = defineApproval<
  SupplierTypes,
  'riskReview'
>({
  name: 'supplierRisk',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  freeze: ['name', 'registrationNo'],
  flow: ['riskReview'],
  stages: {
    riskReview: stage.single({
      title: 'Risk review',
      // Reminded after two days, passed to the head of risk after five.
      remindAfterHours: 48,
      escalateAfterHours: 120,
      assignee: ({ services }) => services.org.holderOf('riskOfficer'),
    }),
  },
  exits: { approved: 'riskApproved', rejected: 'riskRejected' },
  notify,
});

function systemOnly({ actor }: Context): GuardVerdict {
  return (
    actor.system === true || {
      code: 'systemOnly',
      message: 'Only the system records this.',
    }
  );
}

function riskOfficer({ actor, record, services }: Context): GuardVerdict {
  if (actor.system === true) return true;
  if (actor.id === record.applicantId)
    return {
      code: 'selfReview',
      message: 'The applicant cannot review their own onboarding.',
    };
  return (
    (services.org.isActive(actor.id) &&
      services.org.hasRole(actor.id, 'riskOfficer')) || {
      code: 'roleRequired',
      message: 'Only an active risk officer can do this.',
    }
  );
}

function supplierOps({ actor, services }: Context): GuardVerdict {
  return (
    services.org.hasRole(actor.id, 'supplierOps') || {
      code: 'roleRequired',
      message: 'Only supplier operations can do this.',
    }
  );
}

/** The approval fact for a supplier that skips risk review, with the rule and the evidence. */
function exemption(
  context: Context,
  evidence: JsonObject,
): Record<string, unknown> {
  return {
    approvedAt: context.now.toISOString(),
    approvalBasis: {
      kind: 'exemption',
      rule: LOW_RISK_EXEMPTION,
      legalApprovedBy: context.record.legalApprovedBy,
      round: context.record.verificationRound,
      evidence,
    },
  };
}

function afterRisk(risk: unknown): SupplierState {
  return risk === 'high' ? 'riskReview' : 'awaitingDeposit';
}

class RegistryCheckFailed extends Error {
  public constructor(checkRound: number, cause: unknown) {
    super(
      `round=${checkRound}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

function failedRound(error: unknown): number | null {
  const match = /^round=(\d+):/.exec(typeof error === 'string' ? error : '');
  return match ? Number(match[1]) : null;
}

const checkRegistry: EffectDefinition<SupplierTypes> =
  defineEffect<SupplierTypes>({
    name: 'scenarioSuppliers.checkRegistry',
    retry: { attempts: 3, backoffMs: 60_000, factor: 2 },
    onSuccess: 'registryChecked',
    onFailure: 'verificationFailed',
    run: async ({ record, services }) => {
      const checkRound = record.verificationRound;
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

const createAccount: EffectDefinition<SupplierTypes> =
  defineEffect<SupplierTypes>({
    name: 'scenarioSuppliers.createAccount',
    retry: { attempts: 3, backoffMs: 30_000, factor: 2 },
    onSuccess: 'accountCreated',
    onFailure: 'accountCreationFailed',
    run: async ({ record, services }) => {
      const { account } = await services.external.createSupplierAccount(
        `supplier-account:${String(record.id)}`,
        record.name,
      );
      return { account };
    },
  });

const notifySupplierOps: EffectDefinition<SupplierTypes> =
  defineEffect<SupplierTypes>({
    name: 'scenarioSuppliers.notifySupplierOps',
    run: async ({ record, services, idempotencyKey }) => {
      await services.outbox.send(
        services.org.holderOf('supplierOps') ?? '',
        `Supplier account creation failed: ${record.name}`,
        idempotencyKey,
      );
    },
  });

interface DepositRow {
  readonly id: string;
  readonly eventId: string;
  readonly supplierId: string;
  readonly depositRef: string;
  readonly amountCents: number;
  readonly use: 'applied' | 'waiting' | 'extra';
  readonly rowVersion: number;
}

function toDeposit(row: Row): DepositRow {
  return {
    id: String(row.id),
    eventId: String(row.eventId),
    supplierId: String(row.supplierId),
    depositRef: String(row.depositRef),
    amountCents: Number(row.amountCents),
    use: row.use as DepositRow['use'],
    rowVersion: Number(row.rowVersion),
  };
}

async function deposits(
  tx: LifecycleTransaction,
  supplierId: string,
): Promise<DepositRow[]> {
  return (await rowsOf(tx.handle).find(SUPPLIER_DEPOSITS, { supplierId })).map(
    toDeposit,
  );
}

export const supplierLifecycle: Lifecycle<SupplierTypes> = defineLifecycle({
  name: SUPPLIERS,
  initial: 'draft',
  states: [
    'draft',
    supplierLegalApproval.state('legalReview'),
    'verifying',
    'manualVerification',
    supplierRiskApproval.state('riskReview'),
    'awaitingDeposit',
    'creatingAccount',
    'accountFailed',
    { name: 'active', final: true },
    { name: 'rejected', final: true },
    { name: 'withdrawn', final: true },
    { name: 'cancelled', final: true },
  ],
  parameters: {
    depositCents: 1_000_000,
    depositWaitDays: 14,
    lowRiskNeedsDeposit: false,
  },
  transitions: {
    submit: {
      from: 'draft',
      to: 'legalReview',
      guard: ({ record, actor }) =>
        actor.id === record.applicantId || {
          code: 'applicantOnly',
          message: 'Only the supplier submits.',
        },
    },
    // How the legal review ends.
    legalApproved: {
      from: 'legalReview',
      to: 'verifying',
      manual: false,
      set: ({ actor, record }) => ({
        legalApprovedBy: actor.id,
        verificationRound: record.verificationRound + 1,
      }),
    },
    legalRejected: { from: 'legalReview', to: 'rejected', manual: false },
    // How the risk review ends: the approval fact, with its basis.
    riskApproved: {
      from: 'riskReview',
      to: 'awaitingDeposit',
      manual: false,
      set: ({ actor, record, now }) => ({
        approvedAt: now.toISOString(),
        approvalBasis: {
          kind: 'decision',
          decidedBy: actor.id,
          legalApprovedBy: record.legalApprovedBy,
          round: record.verificationRound,
          risk: record.riskLevel,
        },
      }),
    },
    riskRejected: { from: 'riskReview', to: 'rejected', manual: false },
    registryChecked: {
      from: 'verifying',
      to: ['riskReview', 'awaitingDeposit'],
      manual: false,
      guard: (context) => {
        const system = systemOnly(context);
        if (system !== true) return system;
        return (
          (context.input.round === context.record.verificationRound &&
            context.input.registrationNo === context.record.registrationNo) || {
            code: 'staleResult',
            message: 'This result answers an earlier check.',
          }
        );
      },
      route: (context) => afterRisk(context.input.risk),
      set: (context) => ({
        riskLevel: context.input.risk,
        verificationError: null,
        ...(context.to === 'riskReview'
          ? {}
          : exemption(context, {
              source: 'registry',
              risk: context.input.risk ?? null,
              registrationNo: context.record.registrationNo,
            })),
      }),
    },
    verificationFailed: {
      from: 'verifying',
      to: 'manualVerification',
      manual: false,
      guard: (context) => {
        const system = systemOnly(context);
        if (system !== true) return system;
        return (
          failedRound(context.input.error) ===
            context.record.verificationRound || {
            code: 'staleResult',
            message: 'This failure belongs to an earlier check.',
          }
        );
      },
      set: ({ input }) => ({ verificationError: text(input.error) }),
    },
    verifyManually: {
      from: 'manualVerification',
      to: ['riskReview', 'awaitingDeposit'],
      guard: riskOfficer,
      validate: (input) => [
        ...(input.risk === 'low' || input.risk === 'high'
          ? []
          : [
              {
                field: 'risk',
                message: 'Say whether the risk is low or high.',
              },
            ]),
        ...(text(input.evidence)
          ? []
          : [{ field: 'evidence', message: 'Say what was checked.' }]),
      ],
      route: (context) => afterRisk(context.input.risk),
      set: (context) => ({
        riskLevel: context.input.risk,
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
      from: [
        'manualVerification',
        'riskReview',
        'awaitingDeposit',
        'accountFailed',
      ],
      to: 'verifying',
      guard: riskOfficer,
      validate: (input) => (text(input.reason) ? null : 'Give a reason.'),
      accept: ['registrationNo'],
      // The approval was given on the old information, so it no longer
      // stands; the log and the approval run keep what granted it.
      set: ({ record }) => ({
        verificationRound: record.verificationRound + 1,
        approvedAt: null,
        approvalBasis: null,
      }),
    },
    depositPaid: {
      from: 'awaitingDeposit',
      to: 'creatingAccount',
      manual: false,
      accept: ['depositRef'],
    },
    expireDeposit: {
      from: 'awaitingDeposit',
      to: 'cancelled',
      manual: false,
    },
    accountCreated: {
      from: 'creatingAccount',
      to: 'active',
      manual: false,
      accept: ['account'],
      set: () => ({ accountError: null }),
    },
    accountCreationFailed: {
      from: 'creatingAccount',
      to: 'accountFailed',
      manual: false,
      set: ({ input }) => ({ accountError: text(input.error) }),
    },
    retryAccount: {
      from: 'accountFailed',
      to: 'creatingAccount',
      guard: supplierOps,
    },
    abandon: {
      from: 'accountFailed',
      to: 'cancelled',
      guard: supplierOps,
      validate: (input) => (text(input.reason) ? null : 'Give a reason.'),
    },
    withdraw: {
      from: [
        'legalReview',
        'verifying',
        'manualVerification',
        'riskReview',
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
    creatingAccount: [createAccount],
    accountFailed: [notifySupplierOps],
  },
  onEnterState: {
    // Waiting for a deposit that is already in, or that this basis does
    // not need, is no wait: go on in the same transaction.
    awaitingDeposit: async ({ record, tx, parameters, lifecycle }) => {
      const needs =
        record.approvalBasis?.kind === 'decision' ||
        parameters.lowRiskNeedsDeposit;
      const waiting = (await deposits(tx, String(record.id))).find(
        (row) => row.use === 'waiting',
      );
      if (needs && !waiting) return;
      if (waiting)
        await rowsOf(tx.handle).update(
          SUPPLIER_DEPOSITS,
          waiting.id,
          { use: 'waiting', rowVersion: waiting.rowVersion },
          { use: 'applied', rowVersion: waiting.rowVersion + 1 },
        );
      await tx.fire(lifecycle, record.id, 'depositPaid', {
        actor: SYSTEM_ACTOR,
        input: waiting ? { depositRef: waiting.depositRef } : { exempt: true },
      });
    },
  },
  triggers: {
    expireUnpaidDeposit: {
      transition: 'expireDeposit',
      when: 'awaitingDeposit',
      after: ({ depositWaitDays }) => depositWaitDays * DAY,
    },
  },
});

export interface DepositEvent {
  readonly id: string;
  readonly supplierId: RecordId;
  readonly depositRef: string;
  readonly amountCents: number;
}

export type DepositAck =
  | {
      readonly outcome: 'applied' | 'kept' | 'replayed' | 'extra';
      readonly state: string;
    }
  | { readonly outcome: 'refused'; readonly reason: string };

/**
 * A deposit callback: kept in the ledger whenever it comes, applied when the
 * onboarding waits for it — in the same transaction. A delivery seen before
 * is a replay; a deposit below the requirement is refused.
 */
export function handleDeposit(
  runtime: LifecycleRuntime,
  event: DepositEvent,
): Promise<DepositAck> {
  return runtime.transaction(async (tx) => {
    const supplier = (await tx.read(SUPPLIERS, event.supplierId)) as
      SupplierOnboarding | undefined;
    if (!supplier) return { outcome: 'refused', reason: 'No such onboarding.' };
    const required = (runtime.parameters(SUPPLIERS) as SupplierParameters)
      .depositCents;
    if (event.amountCents < required)
      return {
        outcome: 'refused',
        reason: 'The deposit is less than required.',
      };
    const rows = await deposits(tx, String(supplier.id));
    if (rows.some((row) => row.eventId === event.id))
      return { outcome: 'replayed', state: supplier.status };
    const extra = rows.length > 0;
    const applies = !extra && supplier.status === 'awaitingDeposit';
    await rowsOf(tx.handle).insert(SUPPLIER_DEPOSITS, {
      eventId: event.id,
      supplierId: String(supplier.id),
      depositRef: event.depositRef,
      amountCents: event.amountCents,
      use: extra ? 'extra' : applies ? 'applied' : 'waiting',
      rowVersion: 0,
    });
    if (applies)
      await tx.fire(SUPPLIERS, supplier.id, 'depositPaid', {
        actor: SYSTEM_ACTOR,
        input: { depositRef: event.depositRef },
      });
    const now = (await tx.read(SUPPLIERS, supplier.id)) as SupplierOnboarding;
    return {
      outcome: extra ? 'extra' : applies ? 'applied' : 'kept',
      state: now.status,
    };
  });
}
