// Scenario 17: an order waits for a provider's webhook; the
// deliveries are rows of the order's payment ledger.
import { SYSTEM_ACTOR } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  expireOverdue,
  handlePaymentEvent,
  orderLifecycle,
  ORDERS,
  paymentsOf,
  type PaymentEvent,
} from '../../server/scenarios/order.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

function setup(parameters: Record<string, unknown> = {}): Harness {
  return createHarness({
    org: { people: ['alice', 'fin1'], roles: { finance: ['fin1'] } },
    lifecycles: [orderLifecycle as never],
    parameters: { [ORDERS]: parameters },
  });
}

async function order(
  h: Harness,
  ready = true,
  payBy: string | null = null,
): Promise<string> {
  const record = await h.create(
    ORDERS,
    {
      customerId: 'alice',
      amountCents: 9900,
      payBy,
      paymentRef: null,
      shipmentNo: null,
      refundRef: null,
    },
    'alice',
  );
  if (ready) await h.fire(ORDERS, record.id, 'markReady', {}, SYSTEM_ACTOR);
  return String(record.id);
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

describe('scenario 17 · waiting for an external event', () => {
  it('a payment wakes the waiting order in the ledger’s transaction, and the shipment follows', async () => {
    const h = setup();
    const id = await order(h);
    expect(await handlePaymentEvent(h.runtime, paid(id))).toEqual({
      outcome: 'applied',
      use: 'applied',
      state: 'paid',
    });
    expect(h.get(ORDERS, id)).toMatchObject({
      status: 'fulfilled',
      paymentRef: `pi_${id}`,
      shipmentNo: `SHIP-${id}`,
    });
    expect(await h.history(ORDERS, id)).toEqual([
      '$create',
      'markReady',
      'paid',
      'shipmentCreated',
    ]);
  });

  it('an early payment waits in the ledger; the order goes straight to paid once ready', async () => {
    const h = setup();
    const id = await order(h, false);
    expect(await handlePaymentEvent(h.runtime, paid(id))).toMatchObject({
      use: 'early',
      state: 'created',
    });
    expect(h.get(ORDERS, id)).toMatchObject({
      status: 'created',
      paymentRef: null,
    });
    await h.fire(ORDERS, id, 'markReady', {}, SYSTEM_ACTOR);
    expect(h.get(ORDERS, id).status).toBe('fulfilled');
    expect(await h.history(ORDERS, id)).toEqual([
      '$create',
      'markReady',
      'paid',
      'shipmentCreated',
    ]);
  });

  it('two early events with different references are both kept: the first pays, the second is an extra one', async () => {
    const h = setup();
    const id = await order(h, false);
    await handlePaymentEvent(h.runtime, paid(id, { paymentRef: 'pi_a' }));
    expect(
      await handlePaymentEvent(h.runtime, paid(id, { paymentRef: 'pi_b' })),
    ).toMatchObject({ use: 'extra' });
    await h.fire(ORDERS, id, 'markReady', {}, SYSTEM_ACTOR);
    expect(h.get(ORDERS, id).paymentRef).toBe('pi_a');
    expect(
      (await paymentsOf(h.runtime, id)).map(
        (row) => `${row.paymentRef}:${row.use}`,
      ),
    ).toEqual(['pi_a:applied', 'pi_b:extra']);
  });

  it('an event for an order that does not exist is acknowledged, not retried', async () => {
    const h = setup();
    expect((await handlePaymentEvent(h.runtime, paid('404'))).outcome).toBe(
      'ignored',
    );
  });

  it('a redelivered event finds its row: a replay, one transition, one shipment', async () => {
    const h = setup();
    const id = await order(h);
    const event = paid(id);
    await handlePaymentEvent(h.runtime, event);
    expect(await handlePaymentEvent(h.runtime, event)).toEqual({
      outcome: 'replayed',
      use: 'applied',
      state: 'fulfilled',
    });
    expect(h.messagesTo('logistics')).toHaveLength(1);
  });

  it('a second, distinct payment for a paid order is recorded and reported, not dropped', async () => {
    const h = setup();
    const id = await order(h);
    const alerts: string[] = [];
    await handlePaymentEvent(h.runtime, paid(id));
    expect(
      await handlePaymentEvent(
        h.runtime,
        paid(id, { paymentRef: 'pi_second_charge' }),
        (message) => {
          alerts.push(message);
        },
      ),
    ).toMatchObject({ outcome: 'applied', use: 'extra', state: 'fulfilled' });
    expect(alerts).toEqual([
      `Order ${id} received another payment (pi_second_charge)`,
    ]);
    expect(h.get(ORDERS, id).paymentRef).toBe(`pi_${id}`);
  });

  it('out of order: a failure delivered after the success changes nothing', async () => {
    const h = setup();
    const id = await order(h);
    await handlePaymentEvent(h.runtime, paid(id));
    expect(
      (
        await handlePaymentEvent(
          h.runtime,
          paid(id, { type: 'payment.failed' }),
        )
      ).outcome,
    ).toBe('ignored');
    expect(h.get(ORDERS, id).status).toBe('fulfilled');
  });

  it('the deadline closes the order and tells the customer; the window is an administrator parameter', async () => {
    const h = setup({ paymentWindowDays: 7 });
    const id = await order(h);
    h.advance({ days: 3, minutes: 1 });
    expect(await h.runtime.runTriggers()).toBe(0);
    h.advance({ days: 4 });
    expect(await h.runtime.runTriggers()).toBe(1);
    expect(h.get(ORDERS, id).status).toBe('expired');
    expect(h.messagesTo('alice')).toEqual([
      `Order ${id} closed: not paid in time`,
    ]);
  });

  it('an order’s own due date is swept by the second layer, not by the trigger', async () => {
    const h = setup();
    const soon = await order(h, true, '2026-10-02T09:00:00.000Z');
    const later = await order(h);
    h.advance({ days: 1, minutes: 1 });
    expect(await h.runtime.runTriggers()).toBe(0);
    expect(await expireOverdue(h.runtime)).toBe(1);
    expect(h.get(ORDERS, soon).status).toBe('expired');
    expect(h.get(ORDERS, later).status).toBe('awaitingPayment');
  });

  it('a late payment after the close goes to manual settlement, then refund or honour', async () => {
    const h = setup();
    const refundId = await order(h);
    const honourId = await order(h);
    h.advance({ days: 4 });
    expect(await h.runtime.runTriggers()).toBe(2);
    expect(await handlePaymentEvent(h.runtime, paid(refundId))).toMatchObject({
      use: 'late',
      state: 'refundRequired',
    });
    expect(h.messagesTo('fin1')).toEqual([
      `Order ${refundId} was paid after it closed (pi_${refundId})`,
    ]);
    expect(
      (await refusal(h.fire(ORDERS, refundId, 'refund', {}, 'fin1'))).code,
    ).toBe('INVALID_INPUT');
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

  it('payment and timeout at once: whichever reaches the order first decides, and the payment is never lost', async () => {
    const h = setup();
    const first = await order(h);
    const second = await order(h);
    h.advance({ days: 3, minutes: 1 });
    // The payment commits first on one, the sweep on the other.
    const [ack] = await Promise.all([
      handlePaymentEvent(h.runtime, paid(first)),
      h.runtime.runTriggers(),
    ]);
    expect(ack.use).toBe('applied');
    expect(h.get(ORDERS, first).status).toBe('fulfilled');
    expect(h.get(ORDERS, second).status).toBe('expired');
    expect((await handlePaymentEvent(h.runtime, paid(second))).use).toBe(
      'late',
    );
    expect(h.get(ORDERS, second).status).toBe('refundRequired');
  });

  it('only the system fires the payment and expiry transitions: none is a button', async () => {
    const h = setup();
    const id = await order(h);
    expect(await h.allowed(ORDERS, id, 'alice')).toEqual([]);
    expect(await h.allowed(ORDERS, id, SYSTEM_ACTOR)).toEqual([]);
  });
});
