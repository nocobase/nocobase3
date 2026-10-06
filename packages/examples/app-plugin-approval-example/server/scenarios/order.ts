import {
  defineEffect,
  defineLifecycle,
  LifecycleError,
  SYSTEM_ACTOR,
  type EffectDefinition,
  type Lifecycle,
  type LifecycleRecord,
  type LifecycleRuntime,
  type LifecycleTransaction,
  type RecordId,
} from '@nocobase/lifecycle';

import { rowsOf, type Row } from '@nocobase/app-plugin-approval/server';
import { text, type ScenarioServices } from './services.js';

// Scenario 17. The order is a plain lifecycle: nobody decides
// anything while it waits, so no approval layer. What changes is where the
// provider's events go: every delivery is a row of the order's payment
// ledger, keyed by the provider's event id, and the ledger moves the order
// in the same transaction when — and only when — a payment means something
// for it. A payment that arrives early, twice, or after the order closed is
// still a row someone can see, not an overwrite or a dropped event.

export type OrderState =
  | 'created'
  | 'awaitingPayment'
  | 'paid'
  | 'fulfilled'
  | 'expired'
  | 'refundRequired'
  | 'refunded';

export interface Order extends LifecycleRecord {
  readonly customerId: string;
  readonly amountCents: number;
  /** A due date of the order's own, if it has one. */
  readonly payBy: string | null;
  readonly paymentRef: string | null;
  readonly shipmentNo: string | null;
  readonly refundRef: string | null;
  readonly status: OrderState;
}

export interface OrderTypes {
  record: Order;
  state: OrderState;
  parameters: { paymentWindowDays: number };
  services: ScenarioServices;
}

export const ORDERS = 'scenarioOrders';
/** One row per payment event a provider delivered. */
export const ORDER_PAYMENTS = 'scenarioOrderPayments';
export const FINANCE_ROLE: string = 'finance';

/** What a payment row came to. */
export type PaymentUse = 'applied' | 'early' | 'late' | 'extra';

export interface PaymentRow {
  readonly id: string;
  readonly eventId: string;
  readonly orderId: string;
  readonly paymentRef: string;
  readonly occurredAt: string;
  readonly use: PaymentUse;
  readonly rowVersion: number;
}

function toPayment(row: Row): PaymentRow {
  return {
    id: String(row.id),
    eventId: String(row.eventId),
    orderId: String(row.orderId),
    paymentRef: String(row.paymentRef),
    occurredAt: String(row.occurredAt),
    use: row.use as PaymentUse,
    rowVersion: Number(row.rowVersion),
  };
}

async function ledger(
  tx: LifecycleTransaction,
  orderId: string,
): Promise<PaymentRow[]> {
  return (await rowsOf(tx.handle).find(ORDER_PAYMENTS, { orderId })).map(
    toPayment,
  );
}

const notifyCustomerExpired: EffectDefinition<OrderTypes> =
  defineEffect<OrderTypes>({
    name: 'scenarioOrders.notifyCustomerExpired',
    retry: { attempts: 3 },
    async run({ record, idempotencyKey, services }) {
      await services.outbox.send(
        record.customerId,
        `Order ${String(record.id)} closed: not paid in time`,
        idempotencyKey,
      );
    },
  });

/** One shipment per order, whichever transition entered `paid`. */
const createShipment: EffectDefinition<OrderTypes> = defineEffect<OrderTypes>({
  name: 'scenarioOrders.createShipment',
  retry: { attempts: 3 },
  onSuccess: 'shipmentCreated',
  async run({ record, services }) {
    const shipmentNo = `SHIP-${String(record.id)}`;
    await services.outbox.send(
      'logistics',
      `Ship order ${String(record.id)} as ${shipmentNo}`,
      `shipment:${String(record.id)}`,
    );
    return { shipmentNo };
  },
});

const askFinanceToSettle: EffectDefinition<OrderTypes> =
  defineEffect<OrderTypes>({
    name: 'scenarioOrders.askFinanceToSettle',
    retry: { attempts: 3 },
    async run({ record, idempotencyKey, services }) {
      await services.outbox.send(
        services.org.holderOf(FINANCE_ROLE) ?? FINANCE_ROLE,
        `Order ${String(record.id)} was paid after it closed (${String(record.paymentRef)})`,
        idempotencyKey,
      );
    },
  });

export const orderLifecycle: Lifecycle<OrderTypes> =
  defineLifecycle<OrderTypes>({
    name: ORDERS,
    initial: 'created',
    states: [
      'created',
      'awaitingPayment',
      'paid',
      { name: 'fulfilled', final: true },
      'expired',
      'refundRequired',
      { name: 'refunded', final: true },
    ],
    parameters: { paymentWindowDays: 3 },
    transitions: {
      // Fired by the system once the order is prepared.
      markReady: { from: 'created', to: 'awaitingPayment', manual: false },
      // Fired by the ledger alone, with the payment that decided it.
      paid: {
        from: 'awaitingPayment',
        to: 'paid',
        manual: false,
        accept: ['paymentRef'],
      },
      paidLate: {
        from: 'expired',
        to: 'refundRequired',
        manual: false,
        accept: ['paymentRef'],
      },
      expire: {
        from: 'awaitingPayment',
        to: 'expired',
        manual: false,
        effects: [notifyCustomerExpired],
      },
      shipmentCreated: {
        from: 'paid',
        to: 'fulfilled',
        manual: false,
        accept: ['shipmentNo'],
      },
      refund: {
        from: 'refundRequired',
        to: 'refunded',
        guard: ({ actor, services }) =>
          services.org.hasRole(actor.id, FINANCE_ROLE) || {
            code: 'financeOnly',
            message: 'Only finance settles a late payment.',
          },
        validate: (input) =>
          text(input.refundRef) ? null : 'A refund needs its reference.',
        accept: ['refundRef'],
      },
      honour: {
        from: 'refundRequired',
        to: 'paid',
        guard: ({ actor, services }) =>
          services.org.hasRole(actor.id, FINANCE_ROLE) || {
            code: 'financeOnly',
            message: 'Only finance settles a late payment.',
          },
      },
    },
    onEnter: { paid: [createShipment], refundRequired: [askFinanceToSettle] },
    onEnterState: {
      // A payment that came while the order was being prepared is waiting in
      // the ledger: the order goes straight on with it.
      awaitingPayment: async ({ record, tx }) => {
        const early = (await ledger(tx, String(record.id))).find(
          (row) => row.use === 'early',
        );
        if (!early) return;
        await rowsOf(tx.handle).update(
          ORDER_PAYMENTS,
          early.id,
          { use: 'early', rowVersion: early.rowVersion },
          { use: 'applied', rowVersion: early.rowVersion + 1 },
        );
        await tx.fire(ORDERS, record.id, 'paid', {
          actor: SYSTEM_ACTOR,
          input: { paymentRef: early.paymentRef, eventId: early.eventId },
        });
      },
    },
    triggers: {
      expireUnpaid: {
        transition: 'expire',
        when: 'awaitingPayment',
        after: ({ paymentWindowDays }) => paymentWindowDays * 86_400_000,
      },
    },
  });

/** A payment provider's webhook delivery, already authenticated. */
export interface PaymentEvent {
  readonly id: string;
  readonly type: 'payment.succeeded' | 'payment.failed';
  readonly orderId: RecordId;
  readonly paymentRef: string;
  readonly occurredAt: string;
}

export interface PaymentAck {
  readonly outcome: 'applied' | 'replayed' | 'ignored';
  /** What the payment came to on the order. */
  readonly use?: PaymentUse;
  readonly state?: string;
  readonly reason?: string;
}

/**
 * Applies one webhook delivery in one transaction: the event becomes a
 * ledger row, and moves the order when it pays it. A redelivery finds its
 * row and changes nothing. Refusals that can never succeed are acknowledged;
 * anything else is thrown so the provider delivers again.
 */
export async function handlePaymentEvent(
  runtime: LifecycleRuntime,
  event: PaymentEvent,
  /** Told after the commit about a payment no order state can use. */
  alert: (message: string) => void | Promise<void> = () => undefined,
): Promise<PaymentAck> {
  if (event.type === 'payment.failed')
    return { outcome: 'ignored', reason: 'A failed attempt changes no order.' };
  return runtime.transaction(async (tx) => {
    const order = (await tx.read(ORDERS, event.orderId)) as Order | undefined;
    if (!order)
      return {
        outcome: 'ignored',
        reason: `No order "${String(event.orderId)}".`,
      };
    const rows = await ledger(tx, String(order.id));
    const seen = rows.find((row) => row.eventId === event.id);
    if (seen)
      return { outcome: 'replayed', use: seen.use, state: order.status };
    const paidAlready = rows.some((row) => row.use !== 'extra');
    const use: PaymentUse = paidAlready
      ? 'extra'
      : order.status === 'created'
        ? 'early'
        : order.status === 'awaitingPayment'
          ? 'applied'
          : order.status === 'expired'
            ? 'late'
            : 'extra';
    await rowsOf(tx.handle).insert(ORDER_PAYMENTS, {
      eventId: event.id,
      orderId: String(order.id),
      paymentRef: event.paymentRef,
      occurredAt: event.occurredAt,
      use,
      rowVersion: 0,
    });
    const input = { paymentRef: event.paymentRef, eventId: event.id };
    if (use === 'applied')
      await tx.fire(ORDERS, order.id, 'paid', { actor: SYSTEM_ACTOR, input });
    if (use === 'late')
      await tx.fire(ORDERS, order.id, 'paidLate', {
        actor: SYSTEM_ACTOR,
        input,
      });
    if (use === 'extra')
      // A second payment for one order: kept, and someone is told after the commit.
      tx.afterCommit(() =>
        alert(
          `Order ${String(order.id)} received another payment (${event.paymentRef})`,
        ),
      );
    const now = (await tx.read(ORDERS, order.id)) as Order;
    return { outcome: 'applied', use, state: now.status };
  });
}

/**
 * Closes orders past a due date of their own — what a trigger, which counts
 * from the last transition, cannot do. Run it on the sweep's schedule.
 */
export async function expireOverdue(
  runtime: LifecycleRuntime,
): Promise<number> {
  const due = await runtime.transaction(async (tx) =>
    (
      (await rowsOf(tx.handle).find(ORDERS, {
        status: 'awaitingPayment',
      })) as Order[]
    ).filter(
      (order) => order.payBy !== null && order.payBy < tx.now.toISOString(),
    ),
  );
  let expired = 0;
  for (const order of due)
    try {
      await runtime.fire(ORDERS, order.id, 'expire', {
        actor: SYSTEM_ACTOR,
        expect: { version: Number(order.lifecycleVersion) },
      });
      expired += 1;
    } catch (error) {
      if (!(error instanceof LifecycleError)) throw error;
    }
  return expired;
}

/** The order's payment ledger, oldest first. */
export function paymentsOf(
  runtime: LifecycleRuntime,
  orderId: RecordId,
): Promise<PaymentRow[]> {
  return runtime.transaction((tx) => ledger(tx, String(orderId)));
}
