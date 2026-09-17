import { expect, it } from 'vitest';
import { createQueueService } from '../../src/service.js';
import { selectedBackend } from '../helpers/backend-harness.js';

it.skipIf(selectedBackend() !== 'redis')(
  'uses explicit Redis connection options for producer and Worker',
  async () => {
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-connection`,
      queueBackend: 'redis',
      connection: {
        host: '127.0.0.1',
        port: Number(process.env.QUEUE_TEST_REDIS_PORT),
      },
    });
    const received: unknown[] = [];
    service.consumer('jobs').consume(async (_channel, message) => {
      received.push(message);
    });
    const producer = service.producer('jobs');
    try {
      await service.setup();
      await producer.publish('event', { explicit: true });
      await expect.poll(() => received).toEqual([{ explicit: true }]);
    } finally {
      await service.shutdown();
    }
  },
);

it.skipIf(selectedBackend() !== 'redis')(
  'reconnects its owned Worker transports and releases them on shutdown',
  async () => {
    const { createTcpProxy } = await import('../helpers/tcp-proxy.js');
    const proxy = await createTcpProxy(
      Number(process.env.QUEUE_TEST_REDIS_PORT),
    );
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-reconnect`,
      queueBackend: 'redis',
      connection: { host: '127.0.0.1', port: proxy.port },
    });
    const received: unknown[] = [];
    service.consumer('jobs').consume(async (_channel, message) => {
      received.push(message);
    });
    const producer = service.producer('jobs');
    try {
      await service.setup();
      await producer.publish('before', 1);
      await expect.poll(() => received).toEqual([1]);
      const originalSockets = [...proxy.sockets];
      expect(originalSockets.length).toBeGreaterThanOrEqual(6);
      proxy.disconnect();
      await expect
        .poll(() =>
          originalSockets.every((socket) => !proxy.sockets.has(socket)),
        )
        .toBe(true);
      await expect
        .poll(() => proxy.sockets.size, { timeout: 5000 })
        .toBeGreaterThanOrEqual(6);
      await producer.publish('after', 2);
      await expect.poll(() => received, { timeout: 5000 }).toEqual([1, 2]);
      await service.shutdown();
      await expect.poll(() => proxy.sockets.size).toBe(0);
    } finally {
      try {
        await service.shutdown();
      } finally {
        await proxy.close();
      }
    }
  },
);

it.skipIf(selectedBackend() !== 'redis')(
  'terminates owned transports during a blackholed shutdown',
  async () => {
    const { createTcpProxy } = await import('../helpers/tcp-proxy.js');
    const proxy = await createTcpProxy(
      Number(process.env.QUEUE_TEST_REDIS_PORT),
    );
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-close-blackhole`,
      queueBackend: 'redis',
      connection: { host: '127.0.0.1', port: proxy.port },
    });
    service.producer('jobs');
    let finished = false;
    let closing: Promise<void> | undefined;
    try {
      await service.setup();
      proxy.blackhole(true);
      closing = service.shutdown().finally(() => {
        finished = true;
      });
      void closing.catch(() => {});
      await expect.poll(() => finished, { timeout: 1500 }).toBe(true);
      await closing;
      await expect.poll(() => proxy.sockets.size).toBe(0);
    } finally {
      proxy.blackhole(false);
      proxy.disconnect();
      await closing?.catch(() => {});
      await service.shutdown().catch(() => {});
      await proxy.close();
    }
  },
);
