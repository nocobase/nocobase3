// Scenario 17: wait for an external event (order → awaiting payment → paid → shipment).
import { LifecycleError, SYSTEM_ACTOR } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  handlePaymentEvent,
  orderLifecycle,
  type PaymentEvent,
} from '../../server/approval-scenarios/order.js';
import { createHarness, type Harness } from './harness.js';

const ORDERS = 'orders';

function setup(parameters: Record<string, unknown> = {}): Harness {
  return createHarness({
    org: { people: ['alice', 'fin1'], roles: { finance: ['fin1'] } },
    lifecycles: [orderLifecycle],
    parameters: { orders: parameters },
  });
}

async function order(h: Harness, ready = true): Promise<string> {
  const record = await h.create(
    ORDERS,
    { customerId: 'alice', amountCents: 9900, paymentRef: null },
    'alice',
  );
  const id = String(record.id);
  if (ready) await h.fire(ORDERS, id, 'markReady', {}, SYSTEM_ACTOR);
  return id;
}

let sequence = 0;
function paid(
  orderId: string,
  overrides: Partial<PaymentEvent> = {},
): PaymentEvent {
  sequence += 1;
  return {
    id: `evt_${sequence}`,
    type: 'payment.succeeded',
    orderId,
    paymentRef: `pi_${orderId}`,
    occurredAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('scenario 17 · happy path: wait, wake on the webhook, create the shipment', () => {
  it('a payment wakes the waiting order and the shipment follows as an effect', async () => {
    const h = setup();
    const id = await order(h);
    expect(h.get(ORDERS, id).status).toBe('awaitingPayment');
    expect(await handlePaymentEvent(h.runtime, paid(id))).toEqual({
      outcome: 'applied',
      state: 'paid',
    });
    expect(h.get(ORDERS, id)).toMatchObject({
      status: 'fulfilled',
      paymentRef: `pi_${id}`,
      shipmentNo: `SHIP-${id}`,
    });
    expect(h.messagesTo('logistics')).toEqual([
      `Ship order ${id} as SHIP-${id}`,
    ]);
    expect(await h.history(ORDERS, id)).toEqual([
      '$create',
      'markReady',
      'paymentSucceeded',
      'shipmentCreated',
    ]);
  });

  it('variant: waiting several days is just a state; nothing runs while it waits', async () => {
    const h = setup();
    const id = await order(h);
    h.advance({ days: 2, hours: 23 });
    expect(await h.runtime.runTriggers()).toBe(0);
    expect(h.get(ORDERS, id).status).toBe('awaitingPayment');
    await handlePaymentEvent(h.runtime, paid(id));
    expect(h.get(ORDERS, id).status).toBe('fulfilled');
  });
});

describe('scenario 17 · variant: the event arrives before the order is ready', () => {
  it('an early payment is remembered on the record and the order goes straight to paid once ready', async () => {
    const h = setup();
    const id = await order(h, false);
    expect(await handlePaymentEvent(h.runtime, paid(id))).toEqual({
      outcome: 'applied',
      state: 'created',
    });
    expect(h.get(ORDERS, id)).toMatchObject({
      status: 'created',
      paymentRef: `pi_${id}`,
    });
    await h.fire(ORDERS, id, 'markReady', {}, SYSTEM_ACTOR);
    expect(h.get(ORDERS, id).status).toBe('fulfilled');
    expect(await h.history(ORDERS, id)).toEqual([
      '$create',
      'paymentSucceeded',
      'markReady',
      'shipmentCreated',
    ]);
  });

  it('an event for an order that does not exist (yet) is acknowledged, not retried', async () => {
    const h = setup();
    const ack = await handlePaymentEvent(h.runtime, paid('404'));
    expect(ack.outcome).toBe('ignored');
  });
});

describe('scenario 17 · variant: duplicate, out-of-order and late events', () => {
  it('a redelivered event (same event id) is a replay: one transition, one shipment', async () => {
    const h = setup();
    const id = await order(h);
    const event = paid(id);
    await handlePaymentEvent(h.runtime, event);
    expect(await handlePaymentEvent(h.runtime, event)).toEqual({
      outcome: 'replayed',
      state: 'fulfilled',
    });
    expect(await h.history(ORDERS, id)).toEqual([
      '$create',
      'markReady',
      'paymentSucceeded',
      'shipmentCreated',
    ]);
    expect(h.messagesTo('logistics')).toHaveLength(1);
  });

  it('the same payment under a new event id is refused by state and acknowledged', async () => {
    const h = setup();
    const id = await order(h);
    await handlePaymentEvent(h.runtime, paid(id));
    const ack = await handlePaymentEvent(h.runtime, paid(id));
    expect(ack.outcome).toBe('ignored');
    expect(
      (await h.history(ORDERS, id)).filter(
        (name) => name === 'paymentSucceeded',
      ),
    ).toHaveLength(1);
  });

  it('out of order: a failure delivered after the success changes nothing', async () => {
    const h = setup();
    const id = await order(h);
    await handlePaymentEvent(h.runtime, paid(id));
    const ack = await handlePaymentEvent(
      h.runtime,
      paid(id, {
        type: 'payment.failed',
        occurredAt: '2026-10-01T09:59:00.000Z',
      }),
    );
    expect(ack.outcome).toBe('ignored');
    expect(h.get(ORDERS, id).status).toBe('fulfilled');
  });

  it('strategy: the deadline closes the order and tells the customer', async () => {
    const h = setup();
    const id = await order(h);
    h.advance({ days: 3, minutes: 1 });
    expect(await h.runtime.runTriggers()).toBe(1);
    expect(h.get(ORDERS, id).status).toBe('expired');
    expect(h.messagesTo('alice')).toEqual([
      `Order ${id} closed: not paid in time`,
    ]);
  });

  it('strategy: the payment window is an administrator parameter', async () => {
    const h = setup({ paymentWindowDays: 7 });
    const id = await order(h);
    h.advance({ days: 3, minutes: 1 });
    expect(await h.runtime.runTriggers()).toBe(0);
    h.advance({ days: 4 });
    expect(await h.runtime.runTriggers()).toBe(1);
    expect(h.get(ORDERS, id).status).toBe('expired');
  });

  it('strategy: a late payment after the close goes to manual settlement, then refund or honour', async () => {
    const h = setup();
    const refundId = await order(h);
    const honourId = await order(h);
    h.advance({ days: 4 });
    expect(await h.runtime.runTriggers()).toBe(2);

    expect(await handlePaymentEvent(h.runtime, paid(refundId))).toEqual({
      outcome: 'applied',
      state: 'refundRequired',
    });
    expect(h.messagesTo('fin1')).toEqual([
      `Order ${refundId} was paid after it closed (pi_${refundId})`,
    ]);
    expect(await h.allowed(ORDERS, refundId, 'alice')).toEqual([]);
    const missing = await h.fire(ORDERS, refundId, 'refund', {}, 'fin1').then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(missing).toMatchObject({ code: 'INVALID_INPUT' });
    await h.fire(ORDERS, refundId, 'refund', { refundRef: 're_1' }, 'fin1');
    expect(h.get(ORDERS, refundId)).toMatchObject({
      status: 'refunded',
      refundRef: 're_1',
    });

    await handlePaymentEvent(h.runtime, paid(honourId));
    await h.fire(ORDERS, honourId, 'honour', {}, 'fin1');
    expect(h.get(ORDERS, honourId)).toMatchObject({
      status: 'fulfilled',
      shipmentNo: `SHIP-${honourId}`,
    });
  });
});

describe('scenario 17 · variant: payment and timeout at the same time', () => {
  it('payment committed first: the sweep finds the order no longer idle and fires nothing', async () => {
    const h = setup();
    const id = await order(h);
    h.advance({ days: 3, minutes: 1 });
    const [ack, fired] = await Promise.all([
      handlePaymentEvent(h.runtime, paid(id)),
      h.runtime.runTriggers(),
    ]);
    expect(ack.outcome).toBe('applied');
    expect(fired).toBe(0);
    expect(h.get(ORDERS, id).status).toBe('paid');
    // The shipment run lost its claim to the memory store's rollback (see the
    // limitation below); reclaim() hands it over once a lease has passed.
    h.advance({ minutes: 6 });
    expect(await h.runtime.reclaim()).toBe(1);
    expect(h.get(ORDERS, id).status).toBe('fulfilled');
  });

  it('timeout committed first: the payment is not lost but routed to settlement', async () => {
    const h = setup();
    const id = await order(h);
    h.advance({ days: 3, minutes: 1 });
    expect(await h.runtime.runTriggers()).toBe(1);
    expect(await handlePaymentEvent(h.runtime, paid(id))).toMatchObject({
      state: 'refundRequired',
    });
  });

  it('a sweep that read the order before the payment committed is refused with CONFLICT', async () => {
    const h = setup();
    const id = await order(h);
    h.advance({ days: 3, minutes: 1 });
    // What runTriggers() passes: the record must have been idle since this instant.
    const changedBefore = new Date(
      h.now().getTime() - 3 * 86_400_000,
    ).toISOString();
    await handlePaymentEvent(h.runtime, paid(id));
    const error = await h.runtime
      .fire(ORDERS, id, 'expire', {
        actor: SYSTEM_ACTOR,
        expect: { changedBefore },
      })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(LifecycleError);
    expect((error as LifecycleError).code).toBe('CONFLICT');
  });

  it('only the system fires the payment and expiry transitions', async () => {
    const h = setup();
    const id = await order(h);
    expect(await h.allowed(ORDERS, id, 'alice')).toEqual([]);
    expect(await h.allowed(ORDERS, id, SYSTEM_ACTOR)).toEqual([
      'paymentSucceeded',
      'expire',
    ]);
  });
});

describe('scenario 17 · limitations', () => {
  it('limitation: a second, distinct payment for a paid order cannot be recorded on it; the handler only acknowledges it', async () => {
    const h = setup();
    const id = await order(h);
    await handlePaymentEvent(h.runtime, paid(id));
    const ack = await handlePaymentEvent(
      h.runtime,
      paid(id, { paymentRef: 'pi_second_charge' }),
    );
    expect(ack.outcome).toBe('ignored');
    expect(h.get(ORDERS, id).paymentRef).toBe(`pi_${id}`);
    expect(h.messagesTo('fin1')).toEqual([]);
  });

  it('limitation: two early events with different references overwrite each other while the order is prepared', async () => {
    const h = setup();
    const id = await order(h, false);
    await handlePaymentEvent(h.runtime, paid(id, { paymentRef: 'pi_a' }));
    await handlePaymentEvent(h.runtime, paid(id, { paymentRef: 'pi_b' }));
    expect(h.get(ORDERS, id).paymentRef).toBe('pi_b');
  });

  it('limitation: (memory store) a refused concurrent transaction rolls back an effect claim made meanwhile', async () => {
    const h = setup();
    const id = await order(h);
    h.advance({ days: 3, minutes: 1 });
    await Promise.all([
      handlePaymentEvent(h.runtime, paid(id)),
      h.runtime.runTriggers(),
    ]);
    // The payment committed and the shipment was dispatched, but the sweep's
    // CONFLICT restored a whole-store snapshot taken before the claim.
    const runs = await h.runtime.listEffectRuns({
      lifecycle: ORDERS,
      recordId: id,
      effect: 'orders.createShipment',
    });
    expect(runs.map(({ status, attempts }) => ({ status, attempts }))).toEqual([
      { status: 'queued', attempts: 0 },
    ]);
    expect(h.get(ORDERS, id).status).toBe('paid');
    expect(h.messagesTo('logistics')).toEqual([
      `Ship order ${id} as SHIP-${id}`,
    ]);
  });

  it('limitation: the deadline counts from the last transition, not from a per-order due date', async () => {
    const h = setup();
    const first = await order(h);
    const second = await order(h);
    // A due date on the record is ignored: a trigger's after() sees only the parameters.
    h.store.patchRecord(orderLifecycle.collection, second, {
      payBy: '2026-10-30T00:00:00.000Z',
    });
    h.advance({ days: 3, minutes: 1 });
    expect(await h.runtime.runTriggers()).toBe(2);
    expect([h.get(ORDERS, first).status, h.get(ORDERS, second).status]).toEqual(
      ['expired', 'expired'],
    );
  });
});
