import { expect, it } from 'vitest';
import { createClient } from 'redis';
import { createNodeRedisClient } from 'bullmq';
import { createQueueService } from '../../src/service.js';
import { createTcpProxy } from '../helpers/tcp-proxy.js';

it.each(['raw', 'official-adapter'] as const)(
  'preserves native %s target, receipts and borrowed ownership across blackhole invalidation',
  async (kind) => {
    const proxy = await createTcpProxy(
      Number(process.env.QUEUE_TEST_REDIS_PORT),
    );
    const raw = createClient({ url: `redis://127.0.0.1:${proxy.port}/0` });
    raw.on('error', () => {});
    await raw.connect();
    const original = JSON.stringify(raw.options);
    const connection = kind === 'raw' ? raw : createNodeRedisClient(raw);
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-native-${kind}`,
      queueBackend: 'redis',
      connection,
    });
    const messages: unknown[] = [];
    service.consumer('jobs').consume(async (_channel, message) => {
      messages.push(message);
    });
    const producer = service.producer('jobs');
    try {
      await service.setup();
      const single = await producer.publish('single', 1);
      const bulk = await producer.publishMany([
        { channel: 'bulk', message: 2 },
        { channel: 'bulk', message: 3 },
      ]);
      expect(typeof single.jobId).toBe('string');
      expect(bulk.map((receipt) => typeof receipt.jobId)).toEqual([
        'string',
        'string',
      ]);
      await expect.poll(() => messages.length).toBe(3);
      expect(messages).toEqual([1, 2, 3]);
      proxy.blackhole(true);
      const start = performance.now();
      const outcomes = await Promise.allSettled([
        producer.publish('lost-a', {}),
        producer.publish('lost-b', {}),
        producer.publishMany([{ channel: 'lost-bulk', message: {} }]),
      ]);
      expect(outcomes.map((result) => result.status)).toEqual([
        'rejected',
        'rejected',
        'rejected',
      ]);
      expect(performance.now() - start).toBeLessThan(13000);
      proxy.blackhole(false);
      await expect(producer.publish('invalidated', {})).rejects.toThrow();
      await service.shutdown();
      await expect.poll(() => proxy.sockets.size).toBe(2);
      expect(raw.isOpen).toBe(true);
      expect(await raw.ping()).toBe('PONG');
      expect(JSON.stringify(raw.options)).toBe(original);
    } finally {
      proxy.blackhole(false);
      await service.shutdown().catch(() => {});
      if (raw.isOpen) raw.destroy();
      await proxy.close();
    }
  },
  25000,
);
