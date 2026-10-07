import type {
  ApprovalDirectory,
  ApprovalService,
} from '@nocobase/app-plugin-approval/server';
import type {
  CreateOptions,
  FireOptions,
  FireResult,
  GuardVerdict,
  JsonPrimitive,
  LifecycleActor,
  LifecycleRecord,
  RecordId,
} from '@nocobase/lifecycle';

import type { OrgDirectory } from './org.js';

/**
 * Reading and writing related rows. Inside a transition the implementation
 * must read and write through that transition's transaction; with the
 * Repository store that means binding it to the `transactionHandle` the
 * services factory receives.
 */
export interface RecordAccess {
  get(collection: string, id: RecordId): Promise<LifecycleRecord | undefined>;
  list(
    collection: string,
    where: (record: LifecycleRecord) => boolean,
  ): Promise<LifecycleRecord[]>;
  /**
   * The rows whose fields equal `match`: a query the store answers from an
   * index, where `list` reads the whole collection.
   */
  find(
    collection: string,
    match: Readonly<Record<string, JsonPrimitive>>,
  ): Promise<LifecycleRecord[]>;
  /**
   * Inserts a row that has a lifecycle without going through
   * `runtime.create()`, which cannot join the caller's transaction: the row
   * gets no `$create` entry and its initial `onEnter` does not run.
   */
  insert(
    collection: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<LifecycleRecord>;
  /**
   * Changes a row that has no lifecycle of its own, such as an approval
   * task. Never use it on a lifecycle's record: that is a transition.
   */
  update(
    collection: string,
    id: RecordId,
    values: Readonly<Record<string, unknown>>,
  ): Promise<void>;
}

/** What an effect uses to move another record on: the runtime itself. */
export interface LifecycleFiring {
  fire(
    name: string,
    id: RecordId,
    transition: string,
    options: FireOptions,
  ): Promise<FireResult>;
  create(
    name: string,
    values: Readonly<Record<string, unknown>>,
    options: CreateOptions,
  ): Promise<FireResult>;
}

/** Messages, keyed so a retried effect delivers each one once. */
export interface Outbox {
  send(to: string, subject: string, key: string): void | Promise<void>;
}

/** Thrown by a payment provider that answered "no": retrying changes nothing. */
export class PaymentDeclined extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PaymentDeclined';
  }
}

/** The external systems the scenarios call from effects. */
export interface ExternalSystems {
  /** Pays once per business key, however often it is called with it. */
  pay(
    key: string,
    payee: string,
    amountCents: number,
  ): { reference: string } | Promise<{ reference: string }>;
  /** Whether a payment under this key went through, for reconciliation. */
  findPayment(
    key: string,
  ):
    | { reference: string }
    | undefined
    | Promise<{ reference: string } | undefined>;
  /** A company registry lookup; throws when the registry is unavailable. */
  checkCompany(
    registrationNo: string,
  ): { risk: 'low' | 'high' } | Promise<{ risk: 'low' | 'high' }>;
  createSupplierAccount(
    key: string,
    supplierName: string,
  ): { account: string } | Promise<{ account: string }>;
  runOnboardingStep(
    key: string,
    step: string,
  ): { done: string } | Promise<{ done: string }>;
  rollBackPreparation(key: string, item: string): void | Promise<void>;
}

/**
 * The collections the scenarios keep their business records in.
 * The approval layer keeps its runs, tasks and events in its own three.
 */
export const SCENARIO_COLLECTIONS: {
  readonly leaveRequests: 'scenarioLeaveRequests';
  readonly ruledLeaves: 'scenarioRuledLeaves';
  readonly financeRequests: 'scenarioFinanceRequests';
  readonly committeeRequests: 'scenarioCommitteeRequests';
  readonly purchaseRequests: 'scenarioPurchaseRequests';
  readonly contracts: 'scenarioContracts';
  readonly contractReviews: 'scenarioContractReviews';
  readonly legalReviews: 'scenarioLegalReviews';
  readonly paymentApprovals: 'scenarioPaymentApprovals';
  readonly trips: 'scenarioTrips';
  readonly poolRequests: 'scenarioPoolRequests';
  readonly counselReviews: 'scenarioCounselReviews';
  readonly matters: 'scenarioMatters';
  readonly visas: 'scenarioVisas';
  readonly replans: 'scenarioReplans';
  readonly purchases: 'scenarioPurchases';
  readonly launches: 'scenarioLaunches';
  readonly onboardings: 'scenarioOnboardings';
  readonly branches: 'scenarioBranches';
  readonly orders: 'scenarioOrders';
  readonly suppliers: 'scenarioSuppliers';
  readonly reimbursements: 'scenarioReimbursements';
  readonly notices: 'scenarioNotices';
  readonly payments: 'scenarioPayments';
  readonly grantRequests: 'scenarioGrantRequests';
  readonly grants: 'scenarioGrants';
} = Object.freeze({
  leaveRequests: 'scenarioLeaveRequests',
  ruledLeaves: 'scenarioRuledLeaves',
  financeRequests: 'scenarioFinanceRequests',
  committeeRequests: 'scenarioCommitteeRequests',
  purchaseRequests: 'scenarioPurchaseRequests',
  contracts: 'scenarioContracts',
  contractReviews: 'scenarioContractReviews',
  legalReviews: 'scenarioLegalReviews',
  paymentApprovals: 'scenarioPaymentApprovals',
  trips: 'scenarioTrips',
  poolRequests: 'scenarioPoolRequests',
  counselReviews: 'scenarioCounselReviews',
  matters: 'scenarioMatters',
  visas: 'scenarioVisas',
  replans: 'scenarioReplans',
  purchases: 'scenarioPurchases',
  launches: 'scenarioLaunches',
  onboardings: 'scenarioOnboardings',
  branches: 'scenarioBranches',
  orders: 'scenarioOrders',
  suppliers: 'scenarioSuppliers',
  reimbursements: 'scenarioReimbursements',
  notices: 'scenarioNotices',
  payments: 'scenarioPayments',
  grantRequests: 'scenarioGrantRequests',
  grants: 'scenarioGrants',
});

/** The services every scenario is registered with. */
export interface ScenarioServices {
  readonly org: OrgDirectory;
  /** Bound to the transaction the services were built for. */
  readonly records: RecordAccess;
  readonly lifecycles: LifecycleFiring;
  readonly outbox: Outbox;
  readonly external: ExternalSystems;
  /** The approval layer's operations, for effects that act on tasks. */
  readonly approvals?: ApprovalService;
}

/** The organization as the approval layer asks it. */
export function directoryOf(services: ScenarioServices): ApprovalDirectory {
  return services.org;
}

/** Common guards. */
export function isActor(
  actor: LifecycleActor,
  person: string,
  message: string,
): GuardVerdict {
  return actor.id === person || { code: 'notAllowed', message };
}

export function systemOnly(actor: LifecycleActor): GuardVerdict {
  return (
    actor.system === true || {
      code: 'systemOnly',
      message: 'Only the system does this.',
    }
  );
}

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
