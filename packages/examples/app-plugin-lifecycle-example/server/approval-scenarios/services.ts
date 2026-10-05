import type {
  CreateOptions,
  FireOptions,
  FireResult,
  JsonPrimitive,
  LifecycleRecord,
  RecordId,
} from '@nocobase/lifecycle';

import type { OrgDirectory } from './org.js';
import type { PolicyRegistry } from './approval/policy.js';

/** The collections the approval scenarios keep their records in. */
export const SCENARIO_COLLECTIONS: {
  readonly leaveRequests: 'scenarioLeaveRequests';
  readonly approvalRequests: 'scenarioApprovalRequests';
  readonly coordinations: 'scenarioCoordinations';
  readonly workItems: 'scenarioWorkItems';
  readonly acknowledgements: 'scenarioAcknowledgements';
  readonly notices: 'scenarioNotices';
  readonly orders: 'scenarioOrders';
  readonly supplierOnboardings: 'scenarioSupplierOnboardings';
  readonly reimbursements: 'scenarioReimbursements';
  readonly paymentRequests: 'scenarioPaymentRequests';
  readonly budgetGrants: 'scenarioBudgetGrants';
  readonly contractApprovals: 'scenarioContractApprovals';
} = Object.freeze({
  leaveRequests: 'scenarioLeaveRequests',
  approvalRequests: 'scenarioApprovalRequests',
  coordinations: 'scenarioCoordinations',
  workItems: 'scenarioWorkItems',
  acknowledgements: 'scenarioAcknowledgements',
  notices: 'scenarioNotices',
  orders: 'scenarioOrders',
  supplierOnboardings: 'scenarioSupplierOnboardings',
  reimbursements: 'scenarioReimbursements',
  paymentRequests: 'scenarioPaymentRequests',
  budgetGrants: 'scenarioBudgetGrants',
  contractApprovals: 'scenarioContractApprovals',
});

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

export interface ScenarioServices {
  readonly org: OrgDirectory;
  readonly policies: PolicyRegistry;
  readonly records: RecordAccess;
  readonly lifecycles: LifecycleFiring;
  readonly outbox: Outbox;
  readonly external: ExternalSystems;
}
