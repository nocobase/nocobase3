import { expect, it } from 'vitest';
import { createQueueService } from '../../src/service.js';
import { selectedBackend } from '../helpers/backend-harness.js';

it.skipIf(selectedBackend() !== 'redis').each(['options', 'url'])(
  'uses explicit Redis %s for producer and Worker',
  async (kind) => {
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-connection-${kind}`,
      queueBackend: 'redis',
      connection:
        kind === 'url'
          ? { url: `redis://127.0.0.1:${process.env.QUEUE_TEST_REDIS_PORT}/0` }
          : {
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

it.skipIf(selectedBackend() !== 'redis')(
  'closes blackholed producer transport when publication times out',
  async () => {
    const { createTcpProxy } = await import('../helpers/tcp-proxy.js');
    const proxy = await createTcpProxy(
      Number(process.env.QUEUE_TEST_REDIS_PORT),
    );
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-publish-blackhole`,
      queueBackend: 'redis',
      connection: { host: '127.0.0.1', port: proxy.port },
    });
    const producer = service.producer('jobs');
    try {
      await service.setup();
      proxy.blackhole(true);
      const results = await Promise.allSettled([
        producer.publish('single-a', {}),
        producer.publish('single-b', {}),
        producer.publishMany([{ channel: 'bulk', message: {} }]),
      ]);
      expect(results.map((result) => result.status)).toEqual([
        'rejected',
        'rejected',
        'rejected',
      ]);
      await expect.poll(() => proxy.sockets.size, { timeout: 2000 }).toBe(0);
      proxy.blackhole(false);
      await expect(producer.publish('invalidated', {})).rejects.toThrow();
      expect(proxy.sockets.size).toBe(0);
    } finally {
      await service.shutdown().catch(() => {});
      await proxy.close();
    }
  },
  20000,
);

it.skipIf(selectedBackend() !== 'redis')(
  'aborts a blackholed initial handshake within setup budget and releases sockets',
  async () => {
    const { createTcpProxy } = await import('../helpers/tcp-proxy.js');
    const proxy = await createTcpProxy(
      Number(process.env.QUEUE_TEST_REDIS_PORT),
    );
    proxy.blackhole(true);
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-setup-blackhole`,
      queueBackend: 'redis',
      setupTimeoutMs: 100,
      connection: { host: '127.0.0.1', port: proxy.port },
    });
    service.consumer('jobs').consume(async () => {});
    const started = performance.now();
    try {
      await expect(service.setup()).rejects.toThrow();
      expect(performance.now() - started).toBeLessThan(1500);
      await expect.poll(() => proxy.sockets.size).toBe(0);
    } finally {
      await service.shutdown().catch(() => {});
      await proxy.close();
    }
  },
);

it.skipIf(selectedBackend() !== 'redis')(
  'terminates an abandoned configuration write without requiring shutdown',
  async () => {
    const { createTcpProxy } = await import('../helpers/tcp-proxy.js');
    const proxy = await createTcpProxy(
      Number(process.env.QUEUE_TEST_REDIS_PORT),
    );
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-configure-blackhole`,
      queueBackend: 'redis',
      connection: { host: '127.0.0.1', port: proxy.port },
    });
    const manager = service.manager('jobs');
    try {
      await service.setup();
      proxy.blackhole(true);
      await expect(
        manager.configure({ rateLimit: { max: 1, duration: 100 } }),
      ).rejects.toThrow();
      await expect.poll(() => proxy.sockets.size, { timeout: 2000 }).toBe(0);
    } finally {
      await service.shutdown().catch(() => {});
      await proxy.close();
    }
  },
  20000,
);

it.skipIf(selectedBackend() !== 'redis')(
  'borrows a caller Redis through owned duplicates without closing the caller',
  async () => {
    const { Redis } = await import('ioredis');
    const { createTcpProxy } = await import('../helpers/tcp-proxy.js');
    const proxy = await createTcpProxy(
      Number(process.env.QUEUE_TEST_REDIS_PORT),
    );
    const owner = new Redis({
      host: '127.0.0.1',
      port: proxy.port,
      connectionName: 'caller-owned',
      maxRetriesPerRequest: 7,
      commandTimeout: 5000,
    });
    await owner.ping();
    const original = { ...owner.options };
    const { vi } = await import('vitest');
    const duplicates = vi.spyOn(owner, 'duplicate');
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-borrowed`,
      queueBackend: 'redis',
      connection: owner,
    });
    const messages: unknown[] = [];
    service.consumer('jobs').consume(async (_channel, message) => {
      messages.push(message);
    });
    try {
      await service.setup();
      await expect.poll(() => proxy.sockets.size).toBe(8);
      expect(duplicates).toHaveBeenCalledTimes(2);
      expect(duplicates.mock.results[0]?.value.options.commandTimeout).toBe(
        10000,
      );
      expect(
        duplicates.mock.results[1]?.value.options.commandTimeout,
      ).toBeUndefined();
      await service.producer('jobs').publish('event', 'borrowed');
      await expect.poll(() => messages).toEqual(['borrowed']);
      await service.shutdown();
      await expect.poll(() => proxy.sockets.size).toBe(2);
      expect(await owner.ping()).toBe('PONG');
      expect(owner.options).toEqual(original);
    } finally {
      await service.shutdown().catch(() => {});
      await owner.quit();
      await proxy.close();
    }
  },
);

it.skipIf(selectedBackend() !== 'redis')(
  'closes newly constructed borrowed-client backends concurrently without opening the caller',
  async () => {
    const { Redis } = await import('ioredis');
    const { createServiceRedisBackend } =
      await import('../../src/backends/redis.js');
    const { createTcpProxy } = await import('../helpers/tcp-proxy.js');
    const proxy = await createTcpProxy(
      Number(process.env.QUEUE_TEST_REDIS_PORT),
    );
    const owner = new Redis({
      host: '127.0.0.1',
      port: proxy.port,
      lazyConnect: true,
    });
    const backend = createServiceRedisBackend('early-close', {
      connection: owner,
    });
    backend.on('error', () => {});
    try {
      await Promise.all([backend.close(), backend.close(), backend.close()]);
      await expect.poll(() => proxy.sockets.size).toBe(0);
      expect(owner.status).toBe('wait');
      expect(await owner.ping()).toBe('PONG');
    } finally {
      await backend.close();
      owner.disconnect();
      await proxy.close();
    }
  },
);

it.skipIf(selectedBackend() !== 'redis')(
  'recovers Worker regular and blocking transports after reconnect handshake bytes are dropped',
  async () => {
    const { createTcpProxy } = await import('../helpers/tcp-proxy.js');
    const proxy = await createTcpProxy(
      Number(process.env.QUEUE_TEST_REDIS_PORT),
    );
    const namespace = `${process.env.QUEUE_TEST_RUN}-handshake-watchdog`;
    const consumer = createQueueService({
      namespace,
      queueBackend: 'redis',
      // Keep a failed recovery assertion from spending the test's remaining
      // budget draining BullMQ's connection-error retry delay in finally.
      shutdownTimeoutMs: 1000,
      cancellationGraceMs: 250,
      connection: { host: '127.0.0.1', port: proxy.port },
    });
    const producer = createQueueService({
      namespace,
      queueBackend: 'redis',
      shutdownTimeoutMs: 1000,
      cancellationGraceMs: 250,
      connection: {
        host: '127.0.0.1',
        port: Number(process.env.QUEUE_TEST_REDIS_PORT),
      },
    });
    const received: unknown[] = [];
    consumer.consumer('jobs').consume(async (_channel, message) => {
      received.push(message);
    });
    const publish = producer.producer('jobs');
    const failures: unknown[] = [];
    const cleanupWithin = async (
      stage: string,
      operation: Promise<unknown>,
      timeoutMs: number,
    ): Promise<void> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          operation,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error(`${stage} exceeded ${timeoutMs}ms`)),
              timeoutMs,
            );
          }),
        ]);
      } catch (error) {
        failures.push(error);
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      await consumer.setup();
      await producer.setup();
      await publish.publish('before', 1);
      await expect.poll(() => received).toEqual([1]);
      const original = [...proxy.sockets];
      proxy.blackhole(true);
      proxy.disconnect();
      await expect
        .poll(() => original.every((socket) => !proxy.sockets.has(socket)))
        .toBe(true);
      await expect
        .poll(() => proxy.sockets.size, { timeout: 5000 })
        .toBeGreaterThanOrEqual(6);
      // Let the new TCP connections transmit their handshake into the blackhole.
      // Restoring forwarding cannot replay those discarded protocol bytes.
      await new Promise((resolve) => setTimeout(resolve, 250));
      const handshakes = [...proxy.sockets];
      proxy.blackhole(false);
      await publish.publish('after', 2);
      await expect
        .poll(() => received, {
          timeout: 15000,
          message: 'Worker delivery after reconnect handshake recovery',
        })
        .toEqual([1, 2]);
      // Both Worker transports (two proxy socket pairs) were actually ended.
      expect(
        handshakes.filter((socket) => !proxy.sockets.has(socket)).length,
      ).toBeGreaterThanOrEqual(4);
      await consumer.shutdown();
      await expect.poll(() => proxy.sockets.size).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(proxy.sockets.size).toBe(0);
    } catch (error) {
      failures.push(error);
    } finally {
      // Preserve the recovery failure, observe both service shutdowns, and
      // always close the fault injector even if service cleanup stalls.
      await cleanupWithin(
        'Reconnect service cleanup',
        Promise.allSettled([consumer.shutdown(), producer.shutdown()]).then(
          (results) => {
            for (const result of results)
              if (result.status === 'rejected') failures.push(result.reason);
          },
        ),
        7000,
      );
      await cleanupWithin('Reconnect proxy cleanup', proxy.close(), 1000);
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw new AggregateError(
        failures,
        'Reconnect recovery or cleanup failed',
        { cause: failures[0] },
      );
  },
  25000,
);
