import { expect, it, vi } from 'vitest';
import { createQueueService } from '@nocobase/queue';
import {
  createDeliveryHandler,
  NOTIFICATION_DELIVERY_CHANNEL,
  NOTIFICATION_QUEUE_NAME,
} from '../server/delivery-job.js';

it('routes delivery IDs only to the owning application handler', async () => {
  const first = createQueueService({ namespace: 'notification-first' });
  const second = createQueueService({ namespace: 'notification-second' });
  const firstSend = vi.fn(async (_id: string) => undefined);
  const secondSend = vi.fn(async (_id: string) => undefined);
  const offFirst = first
    .consumer(NOTIFICATION_QUEUE_NAME)
    .consume(createDeliveryHandler({ send: firstSend }));
  const offSecond = second
    .consumer(NOTIFICATION_QUEUE_NAME)
    .consume(createDeliveryHandler({ send: secondSend }));
  try {
    await Promise.all([first.setup(), second.setup()]);
    await first
      .producer(NOTIFICATION_QUEUE_NAME)
      .publish('unrelated', { deliveryId: 'ignored' });
    await first
      .producer(NOTIFICATION_QUEUE_NAME)
      .publish(NOTIFICATION_DELIVERY_CHANNEL, { deliveryId: 'one' });
    await second
      .producer(NOTIFICATION_QUEUE_NAME)
      .publish(NOTIFICATION_DELIVERY_CHANNEL, { deliveryId: 'two' });
    await expect.poll(() => firstSend.mock.calls).toEqual([['one']]);
    await expect.poll(() => secondSend.mock.calls).toEqual([['two']]);
  } finally {
    await Promise.all([offFirst(), offSecond()]);
    await Promise.all([first.shutdown(), second.shutdown()]);
  }
});

it('waits for an in-flight provider send when unregistering the handler', async () => {
  const queue = createQueueService({ namespace: 'notification-shutdown' });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const off = queue.consumer(NOTIFICATION_QUEUE_NAME).consume(
    createDeliveryHandler({
      send: async () => {
        entered.resolve();
        await release.promise;
        return undefined;
      },
    }),
  );
  try {
    await queue.setup();
    await queue
      .producer(NOTIFICATION_QUEUE_NAME)
      .publish(NOTIFICATION_DELIVERY_CHANNEL, { deliveryId: 'one' });
    await entered.promise;
    let settled = false;
    const stop = off().then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    release.resolve();
    await stop;
  } finally {
    release.resolve();
    await off();
    await queue.shutdown();
  }
});
