// A runtime holding several lifecycles on one memory store, with a fake
// clock, an in-process dispatcher and fakes for the organization, the
// outbox and the external systems — what the approval scenarios share.
import {
  LifecycleRuntime,
  MemoryLifecycleStore,
  type FireOptions,
  type JsonObject,
  type Lifecycle,
  type LifecycleActor,
  type LifecycleRecord,
  type LifecycleTypes,
  type RecordId,
} from '@nocobase/lifecycle';

import type { ApprovalPolicy } from '../../server/approval-scenarios/approval/policy.js';
import { PolicyRegistry } from '../../server/approval-scenarios/approval/policy.js';
import {
  OrgDirectory,
  type OrgSnapshot,
} from '../../server/approval-scenarios/org.js';
import {
  PaymentDeclined,
  type ExternalSystems,
  type RecordAccess,
  type ScenarioServices,
} from '../../server/approval-scenarios/services.js';

/** A memory store that can also list a collection, as a Repository can. */
export class ListingMemoryStore extends MemoryLifecycleStore {
  private readonly ids: Map<string, Set<string>> = new Map();

  public override insertRecord(
    collection: string,
    values: Readonly<Record<string, unknown>>,
  ): LifecycleRecord {
    const record = super.insertRecord(collection, values);
    const ids = this.ids.get(collection) ?? new Set<string>();
    ids.add(String(record.id));
    this.ids.set(collection, ids);
    return record;
  }

  /** Every record of a collection as it is now; rolled-back inserts are gone. */
  public all(collection: string): LifecycleRecord[] {
    return [...(this.ids.get(collection) ?? [])]
      .map((id) => this.record(collection, id))
      .filter((record): record is LifecycleRecord => record !== undefined);
  }
}

export interface SentMessage {
  readonly to: string;
  readonly subject: string;
  readonly key: string;
}

/** Fakes of the external systems, with switches to make them fail. */
export class FakeExternal implements ExternalSystems {
  public readonly payments: Map<
    string,
    { reference: string; payee: string; amountCents: number }
  > = new Map();
  public readonly calls: string[] = [];
  /** Balance available for payments; a payment above it is declined. */
  public balanceCents: number = Number.POSITIVE_INFINITY;
  /** Calls of these kinds throw a transient error this many more times. */
  public readonly outages: Map<string, number> = new Map();
  /** Pay, then lose the response: the payment exists but the caller sees an error. */
  public loseNextPaymentResponse: boolean = false;
  public companyRisk: Record<string, 'low' | 'high'> = {};
  public readonly accounts: Map<string, string> = new Map();
  public readonly rolledBack: string[] = [];

  private outage(kind: string): void {
    const remaining = this.outages.get(kind) ?? 0;
    if (remaining > 0) {
      this.outages.set(kind, remaining - 1);
      throw new Error(`${kind} is unavailable.`);
    }
  }

  public pay(
    key: string,
    payee: string,
    amountCents: number,
  ): { reference: string } {
    this.calls.push(`pay:${key}`);
    this.outage('pay');
    const existing = this.payments.get(key);
    if (existing) return { reference: existing.reference };
    if (amountCents > this.balanceCents)
      throw new PaymentDeclined('Insufficient balance.');
    this.balanceCents -= amountCents;
    const payment = {
      reference: `PAY-${this.payments.size + 1}`,
      payee,
      amountCents,
    };
    this.payments.set(key, payment);
    if (this.loseNextPaymentResponse) {
      this.loseNextPaymentResponse = false;
      throw new Error('The payment response was lost.');
    }
    return { reference: payment.reference };
  }

  public findPayment(key: string): { reference: string } | undefined {
    const payment = this.payments.get(key);
    return payment ? { reference: payment.reference } : undefined;
  }

  public checkCompany(registrationNo: string): { risk: 'low' | 'high' } {
    this.calls.push(`checkCompany:${registrationNo}`);
    this.outage('checkCompany');
    return { risk: this.companyRisk[registrationNo] ?? 'low' };
  }

  public createSupplierAccount(
    key: string,
    supplierName: string,
  ): { account: string } {
    this.calls.push(`createSupplierAccount:${key}`);
    this.outage('createSupplierAccount');
    const existing = this.accounts.get(key);
    if (existing) return { account: existing };
    const account = `ACC-${this.accounts.size + 1}-${supplierName}`;
    this.accounts.set(key, account);
    return { account };
  }

  public runOnboardingStep(key: string, step: string): { done: string } {
    this.calls.push(`step:${step}:${key}`);
    this.outage(`step:${step}`);
    return { done: step };
  }

  public rollBackPreparation(key: string, item: string): void {
    this.calls.push(`rollBack:${item}:${key}`);
    this.rolledBack.push(item);
  }
}

export interface HarnessOptions {
  readonly org: OrgSnapshot;
  readonly policies?: Readonly<Record<string, ApprovalPolicy>>;
  readonly now?: string;
  /** Lifecycles to register; each gets the same services. */
  readonly lifecycles: readonly Lifecycle<LifecycleTypes>[];
  /** Parameter overrides by lifecycle name. */
  readonly parameters?: Readonly<Record<string, Record<string, unknown>>>;
}

export interface Harness {
  readonly runtime: LifecycleRuntime;
  readonly store: ListingMemoryStore;
  readonly services: ScenarioServices;
  readonly org: OrgDirectory;
  readonly policies: PolicyRegistry;
  readonly external: FakeExternal;
  readonly sent: SentMessage[];
  now(): Date;
  advance(duration: { days?: number; hours?: number; minutes?: number }): void;
  /** Creates a record through the lifecycle, as a create form would. */
  create(
    lifecycle: string,
    values: Readonly<Record<string, unknown>>,
    actor?: string | LifecycleActor,
  ): Promise<LifecycleRecord>;
  /** Fires a transition and returns the record once its effects have settled. */
  fire(
    lifecycle: string,
    id: RecordId,
    transition: string,
    input?: JsonObject,
    actor?: string | LifecycleActor,
    options?: Omit<FireOptions, 'actor' | 'input'>,
  ): Promise<LifecycleRecord>;
  get(lifecycle: string, id: RecordId): LifecycleRecord;
  all(lifecycle: string): LifecycleRecord[];
  history(lifecycle: string, id: RecordId): Promise<string[]>;
  /** Names of the allowed transitions for the actor. */
  allowed(
    lifecycle: string,
    id: RecordId,
    actor: string | LifecycleActor,
  ): Promise<string[]>;
  messagesTo(person: string): string[];
}

function actorOf(actor: string | LifecycleActor | undefined): LifecycleActor {
  if (actor === undefined) return { id: 'tester' };
  return typeof actor === 'string' ? { id: actor } : actor;
}

export function createHarness(options: HarnessOptions): Harness {
  let clock = new Date(options.now ?? '2026-10-01T09:00:00Z').getTime();
  const store = new ListingMemoryStore();
  const runtime = new LifecycleRuntime({
    store,
    clock: (): Date => new Date(clock),
  });
  const org = new OrgDirectory(options.org);
  const policies = new PolicyRegistry(options.policies ?? {});
  const external = new FakeExternal();
  const sent: SentMessage[] = [];
  const delivered = new Set<string>();
  const collections = new Map<string, string>();
  for (const lifecycle of options.lifecycles)
    collections.set(lifecycle.name, lifecycle.collection);
  const collectionOf = (lifecycle: string): string => {
    const collection = collections.get(lifecycle);
    if (!collection)
      throw new Error(`Lifecycle "${lifecycle}" is not in the harness.`);
    return collection;
  };

  // The memory store's transactions run on the store itself, so reading it
  // from a guard reads what the transaction has written so far.
  const records: RecordAccess = {
    get: (collection, id) => Promise.resolve(store.record(collection, id)),
    list: (collection, where) =>
      Promise.resolve(store.all(collection).filter(where)),
    find: (collection, match) =>
      Promise.resolve(
        store
          .all(collection)
          .filter((record) =>
            Object.entries(match).every(([field, value]) =>
              value === null
                ? record[field] === null || record[field] === undefined
                : record[field] === value,
            ),
          ),
      ),
    insert: (collection, values) =>
      Promise.resolve(store.insertRecord(collection, values)),
    update: (collection, id, values) => {
      store.patchRecord(collection, id, values);
      return Promise.resolve();
    },
  };
  const services: ScenarioServices = {
    org,
    policies,
    records,
    lifecycles: runtime,
    outbox: {
      send: (to, subject, key) => {
        if (delivered.has(key)) return;
        delivered.add(key);
        sent.push({ to, subject, key });
      },
    },
    external,
  };
  for (const lifecycle of options.lifecycles) {
    const overrides = options.parameters?.[lifecycle.name] ?? {};
    runtime.register(lifecycle, {
      services: services as never,
      parameters: () => overrides as never,
    });
  }

  const harness: Harness = {
    runtime,
    store,
    services,
    org,
    policies,
    external,
    sent,
    now: () => new Date(clock),
    advance: ({ days = 0, hours = 0, minutes = 0 }) => {
      clock += days * 86_400_000 + hours * 3_600_000 + minutes * 60_000;
    },
    create: async (lifecycle, values, actor) => {
      const { record } = await runtime.create(lifecycle, values, {
        actor: actorOf(actor),
      });
      return harness.get(lifecycle, record.id);
    },
    fire: async (lifecycle, id, transition, input = {}, actor, extra = {}) => {
      await runtime.fire(lifecycle, id, transition, {
        ...extra,
        actor: actorOf(actor),
        input,
      });
      return harness.get(lifecycle, id);
    },
    get: (lifecycle, id) => {
      const record = store.record(collectionOf(lifecycle), id);
      if (!record) throw new Error(`No ${lifecycle} record "${String(id)}".`);
      return record;
    },
    all: (lifecycle) => store.all(collectionOf(lifecycle)),
    history: async (lifecycle, id) =>
      (await runtime.history(lifecycle, id)).transitions.map(
        (entry) => entry.transition,
      ),
    allowed: async (lifecycle, id, actor) =>
      (await runtime.available(lifecycle, id, actorOf(actor)))
        .filter((transition) => transition.allowed)
        .map((transition) => transition.name),
    messagesTo: (person) =>
      sent
        .filter((message) => message.to === person)
        .map((message) => message.subject),
  };
  return harness;
}
