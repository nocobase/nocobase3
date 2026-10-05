import {
  defineEffect,
  defineLifecycle,
  LifecycleError,
  SYSTEM_ACTOR,
  type EffectDefinition,
  type GuardVerdict,
  type Lifecycle,
  type LifecycleRecord,
  type RecordId,
  type TransitionContext,
} from '@nocobase/lifecycle';

import {
  SCENARIO_COLLECTIONS,
  type LifecycleFiring,
  type ScenarioServices,
} from './services.js';

// Scenario 17: an order waits days for a payment provider's webhook. The
// waiting condition is the order's own state; the deadline is a trigger;
// the provider's event id is the requestId, so a redelivery is a replay.

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
  /** Set by the first payment event, even one that arrives while the order is still being prepared. */
  readonly paymentRef: string | null;
  readonly paidAt: string | null;
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

type Context = TransitionContext<OrderTypes>;

/** Who settles late payments: refund them, or honour the order. */
export const FINANCE_ROLE: string = 'finance';

const systemOnly = ({ actor }: Context): GuardVerdict =>
  actor.system === true || {
    code: 'systemOnly',
    message: 'Only the system does this.',
  };

const financeOnly = ({ actor, services }: Context): GuardVerdict =>
  services.org.hasRole(actor.id, FINANCE_ROLE) || {
    code: 'financeOnly',
    message: 'Only finance settles a late payment.',
  };

const notifyCustomerExpired: EffectDefinition<OrderTypes> =
  defineEffect<OrderTypes>({
    name: 'orders.notifyCustomerExpired',
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
  name: 'orders.createShipment',
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
    name: 'orders.askFinanceToSettle',
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
    name: 'orders',
    collection: SCENARIO_COLLECTIONS.orders,
    initial: 'created',
    states: [
      'created',
      'awaitingPayment',
      'paid',
      { name: 'fulfilled', final: true },
      // Not final: a payment can still arrive after the order closed, and it
      // must land somewhere a person sees rather than be dropped.
      'expired',
      'refundRequired',
      { name: 'refunded', final: true },
    ],
    parameters: { paymentWindowDays: 3 },
    transitions: {
      // The order is prepared (stock reserved and so on) and may now be paid.
      // A payment that already arrived early moves it straight on.
      markReady: {
        from: 'created',
        to: ['awaitingPayment', 'paid'],
        guard: systemOnly,
        route: ({ record }) => (record.paymentRef ? 'paid' : 'awaitingPayment'),
      },
      paymentSucceeded: {
        from: ['created', 'awaitingPayment', 'expired'],
        to: ['created', 'paid', 'refundRequired'],
        guard: systemOnly,
        validate: (input) =>
          typeof input.paymentRef === 'string' && input.paymentRef
            ? null
            : 'A payment needs its reference.',
        // Early: remember it and keep preparing. On time: paid. Late: a person settles it.
        route: ({ record }) =>
          record.status === 'created'
            ? 'created'
            : record.status === 'awaitingPayment'
              ? 'paid'
              : 'refundRequired',
        accept: ['paymentRef'],
        set: ({ input, now }) => ({
          paidAt:
            typeof input.occurredAt === 'string'
              ? input.occurredAt
              : now.toISOString(),
        }),
      },
      expire: {
        from: 'awaitingPayment',
        to: 'expired',
        guard: systemOnly,
        effects: [notifyCustomerExpired],
      },
      shipmentCreated: {
        from: 'paid',
        to: 'fulfilled',
        guard: systemOnly,
        accept: ['shipmentNo'],
      },
      refund: {
        from: 'refundRequired',
        to: 'refunded',
        guard: financeOnly,
        validate: (input) =>
          typeof input.refundRef === 'string' && input.refundRef
            ? null
            : 'A refund needs its reference.',
        accept: ['refundRef'],
      },
      // Finance decides to honour the late payment and ship after all.
      honour: {
        from: 'refundRequired',
        to: 'paid',
        guard: financeOnly,
      },
    },
    onEnter: {
      paid: [createShipment],
      refundRequired: [askFinanceToSettle],
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
  /** The provider's event id: the same on every redelivery of one event. */
  readonly id: string;
  readonly type: 'payment.succeeded' | 'payment.failed';
  readonly orderId: RecordId;
  readonly paymentRef: string;
  readonly occurredAt: string;
}

/** What the webhook answers. Anything thrown instead answers 500, and the provider redelivers. */
export interface PaymentAck {
  readonly outcome: 'applied' | 'replayed' | 'ignored';
  /** The order's state after this delivery, when it was applied or replayed. */
  readonly state?: string;
  readonly reason?: string;
}

/**
 * Applies one webhook delivery. Refusals that can never succeed are
 * acknowledged so the provider stops redelivering; a CONFLICT or a store
 * failure is thrown, because the next delivery may succeed.
 */
export async function handlePaymentEvent(
  runtime: LifecycleFiring,
  event: PaymentEvent,
): Promise<PaymentAck> {
  // A failed attempt changes nothing: the customer may pay again before the
  // deadline, and a failure arriving after a success is simply old news.
  if (event.type === 'payment.failed')
    return { outcome: 'ignored', reason: 'A failed attempt changes no order.' };
  try {
    const result = await runtime.fire(
      'orders',
      event.orderId,
      'paymentSucceeded',
      {
        actor: SYSTEM_ACTOR,
        requestId: `payments:${event.id}`,
        input: { paymentRef: event.paymentRef, occurredAt: event.occurredAt },
      },
    );
    return {
      outcome: result.replayed ? 'replayed' : 'applied',
      state: String(result.record.status),
    };
  } catch (error) {
    if (
      error instanceof LifecycleError &&
      (error.code === 'INVALID_STATE' || error.code === 'RECORD_NOT_FOUND')
    )
      return { outcome: 'ignored', reason: error.message };
    throw error;
  }
}
