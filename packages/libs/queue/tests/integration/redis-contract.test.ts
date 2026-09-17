import { expect, it } from 'vitest';
import { createQueueService } from '../../src/service.js';
import { selectedBackend } from '../helpers/backend-harness.js';

it.skipIf(selectedBackend() !== 'redis')(
  'competes across services while isolating namespaces and preserving JSON envelopes',
  async () => {
    const connection = {
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_REDIS_PORT),
    };
    const namespace = `${process.env.QUEUE_TEST_RUN}-contract`;
    const first = createQueueService({
      namespace,
      queueBackend: 'redis',
      connection,
    });
    const second = createQueueService({
      namespace,
      queueBackend: 'redis',
      connection,
    });
    const isolated = createQueueService({
      namespace: `${namespace}-isolated`,
      queueBackend: 'redis',
      connection,
    });
    const counts = new Map<number, number>();
    const received: unknown[] = [];
    const started = new Set<string>();
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const consume = async (
      _channel: string,
      message: unknown,
    ): Promise<void> => {
      if (typeof message !== 'number')
        throw new Error('Expected numeric message');
      counts.set(message, (counts.get(message) ?? 0) + 1);
    };
    first.consumer('jobs').consume(async (channel, message) => {
      started.add('first');
      await gate;
      await consume(channel, message);
    });
    second.consumer('jobs').consume(async (channel, message) => {
      started.add('second');
      await gate;
      await consume(channel, message);
    });
    isolated.consumer('jobs').consume(async (_channel, message) => {
      received.push(message);
    });
    try {
      await Promise.all([first.setup(), second.setup(), isolated.setup()]);
      await first.producer('jobs').publishMany(
        Array.from({ length: 20 }, (_, message) => ({
          channel: 'event',
          message,
        })),
      );
      await expect.poll(() => started.size, { timeout: 5000 }).toBe(2);
      release();
      const payload = {
        nul: '\u0000',
        surrogate: '\ud800',
        version: 99,
        payload: 'business',
      };
      await isolated.producer('jobs').publish('event', payload);
      await expect.poll(() => counts.size, { timeout: 5000 }).toBe(20);
      await expect.poll(() => received, { timeout: 5000 }).toEqual([payload]);
      expect([...counts.values()]).toEqual(Array.from({ length: 20 }, () => 1));
    } finally {
      release();
      await Promise.all([
        first.shutdown(),
        second.shutdown(),
        isolated.shutdown(),
      ]);
    }
  },
);
