import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { expect, it } from 'vitest';
import { createQueueIdentity } from '../../src/identity.js';
import { createQueueService } from '../../src/service.js';
import { createTcpProxy } from '../helpers/tcp-proxy.js';

const target = {
  host: '127.0.0.1',
  port: Number(process.env.QUEUE_TEST_REDIS_PORT),
};

it.each(['options', 'caller-url'] as const)(
  'delivers through official Redis %s connections',
  async (kind) => {
    const caller =
      kind === 'caller-url'
        ? new Redis(`redis://127.0.0.1:${target.port}/0`, {
            maxRetriesPerRequest: null,
          })
        : undefined;
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-connection-${kind}`,
      queueBackend: 'redis',
      connection: caller ?? target,
    });
    const received: unknown[] = [];
    service.consumer('jobs').consume(async (_channel, message) => {
      received.push(message);
    });
    try {
      await service.setup();
      await service.producer('jobs').publish('event', { explicit: true });
      await expect.poll(() => received).toEqual([{ explicit: true }]);
      await service.shutdown();
      if (caller) expect(await caller.ping()).toBe('PONG');
    } finally {
      await service.shutdown();
      await caller?.quit();
    }
  },
);

it('recovers business delivery after a real connection interruption', async () => {
  const proxy = await createTcpProxy(target.port);
  const service = createQueueService({
    namespace: `${process.env.QUEUE_TEST_RUN}-reconnect`,
    queueBackend: 'redis',
    connection: { host: target.host, port: proxy.port },
  });
  const received: unknown[] = [];
  service.consumer('jobs').consume(async (_channel, message) => {
    received.push(message);
  });
  try {
    await service.setup();
    await service.producer('jobs').publish('before', 1);
    await expect.poll(() => received).toEqual([1]);
    proxy.disconnect();
    await service.producer('jobs').publish('after', 2);
    await expect.poll(() => received, { timeout: 10000 }).toEqual([1, 2]);
    await service.shutdown();
  } finally {
    try {
      await service.shutdown();
    } finally {
      await proxy.close();
    }
  }
}, 20000);

it('bounds initial readiness waiting and never admits a handler after late readiness', async () => {
  const proxy = await createTcpProxy(target.port);
  proxy.blackhole(true);
  const service = createQueueService({
    namespace: `${process.env.QUEUE_TEST_RUN}-setup-blackhole`,
    queueBackend: 'redis',
    setupTimeoutMs: 100,
    shutdownTimeoutMs: 100,
    cancellationGraceMs: 100,
    connection: {
      host: target.host,
      port: proxy.port,
      retryStrategy: () => null,
    },
  });
  const producer = service.producer('jobs');
  let calls = 0;
  service.consumer('jobs').consume(async () => {
    calls++;
  });
  const started = performance.now();
  try {
    await expect(service.setup()).rejects.toThrow();
    // Cleanup has its own 5-second budget; timeout does not mean command cancellation.
    expect(performance.now() - started).toBeLessThan(6500);
    proxy.blackhole(false);
    proxy.disconnect();
    await expect(producer.publish('late', {})).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(calls).toBe(0);
  } finally {
    proxy.blackhole(false);
    proxy.disconnect();
    await service.shutdown().catch(() => {});
    await proxy.close();
  }
}, 15000);

it('times out publication waiting, observes late writes and accepts subsequent publications', async () => {
  const caller = new Redis({ ...target, maxRetriesPerRequest: null });
  const namespace = `${process.env.QUEUE_TEST_RUN}-late-publication`;
  const service = createQueueService({
    namespace,
    queueBackend: 'redis',
    connection: caller,
  });
  const identity = createQueueIdentity(namespace, 'jobs');
  const observer = new Queue(identity.redisQueueName, {
    connection: caller,
    prefix: identity.redisPrefix,
  });
  const producer = service.producer('jobs');
  try {
    await service.setup();
    await observer.waitUntilReady();
    // A real server-side write pause preserves commands, unlike a lossy TCP blackhole.
    await caller.call('CLIENT', 'PAUSE', '11500', 'WRITE');
    const started = performance.now();
    const outcomes = await Promise.allSettled([
      producer.publish('single', {}, { jobIdProducer: () => 'late-single' }),
      producer.publishMany([{ channel: 'bulk', message: {} }], {
        jobIdProducer: () => 'late-bulk',
      }),
    ]);
    expect(outcomes.map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    for (const outcome of outcomes)
      if (outcome.status === 'rejected')
        expect(outcome.reason).toMatchObject({
          message: expect.stringContaining('deadline'),
        });
    expect(performance.now() - started).toBeGreaterThanOrEqual(9500);
    expect(performance.now() - started).toBeLessThan(11000);
    await expect
      .poll(() => observer.getJobState('late-single'), { timeout: 5000 })
      .toBe('waiting');
    await expect
      .poll(() => observer.getJobState('late-bulk'), { timeout: 5000 })
      .toBe('waiting');
    const next = await producer.publish('after', {});
    expect(typeof next.jobId).toBe('string');
    expect(await observer.getWaitingCount()).toBe(3);
    await service.shutdown();
    expect(await caller.ping()).toBe('PONG');
  } finally {
    await caller.call('CLIENT', 'UNPAUSE');
    await service.shutdown();
    await observer.close();
    await caller.quit();
  }
}, 20000);

it('treats default metadata as best-effort but awaits an explicit rate-limit write', async () => {
  const caller = new Redis({ ...target, maxRetriesPerRequest: null });
  const service = createQueueService({
    namespace: `${process.env.QUEUE_TEST_RUN}-metadata`,
    queueBackend: 'redis',
    connection: caller,
  });
  const manager = service.manager('jobs');
  let configure: Promise<void> | undefined;
  let configured = false;
  try {
    await caller.ping();
    await caller.call('CLIENT', 'PAUSE', '5000', 'WRITE');
    const start = performance.now();
    await service.setup();
    expect(performance.now() - start).toBeLessThan(2000);
    configure = manager
      .configure({ rateLimit: { max: 1, duration: 100 } })
      .then(() => {
        configured = true;
      });
    void configure.catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(configured).toBe(false);
    // Use an independent control connection: the shared caller is ordered behind its write.
    const control = new Redis(target);
    try {
      await control.call('CLIENT', 'UNPAUSE');
    } finally {
      await control.quit();
    }
    await configure;
    expect(configured).toBe(true);
  } finally {
    const control = new Redis(target);
    try {
      await control.call('CLIENT', 'UNPAUSE');
    } finally {
      await control.quit();
    }
    await configure;
    await service.shutdown();
    await caller.quit();
  }
}, 10000);

it('preserves caller-supplied options and leaves the shared caller usable', async () => {
  const caller = new Redis({
    ...target,
    maxRetriesPerRequest: null,
    commandTimeout: 15000,
  });
  const original = { ...caller.options };
  const service = createQueueService({
    namespace: `${process.env.QUEUE_TEST_RUN}-shared`,
    queueBackend: 'redis',
    connection: caller,
  });
  const received: unknown[] = [];
  service.consumer('jobs').consume(async (_channel, message) => {
    received.push(message);
  });
  try {
    await service.setup();
    await service.producer('jobs').publish('event', 'shared');
    await expect.poll(() => received).toEqual(['shared']);
    await service.shutdown();
    expect(caller.options).toEqual(original);
    expect(await caller.ping()).toBe('PONG');
  } finally {
    await service.shutdown();
    await caller.quit();
  }
});

it('allows official readiness to connect a lazy shared caller and does not own its close', async () => {
  const caller = new Redis({
    ...target,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  const service = createQueueService({
    namespace: `${process.env.QUEUE_TEST_RUN}-lazy-shared`,
    queueBackend: 'redis',
    connection: caller,
  });
  service.producer('jobs');
  try {
    expect(caller.status).toBe('wait');
    await service.setup();
    expect(await caller.ping()).toBe('PONG');
    await Promise.all([
      service.shutdown(),
      service.shutdown(),
      service.shutdown(),
    ]);
    expect(await caller.ping()).toBe('PONG');
  } finally {
    await service.shutdown();
    caller.disconnect();
  }
});

it('does not poison future publication after a caller-configured command timeout', async () => {
  const caller = new Redis({ ...target, commandTimeout: 100 });
  const control = new Redis(target);
  const service = createQueueService({
    namespace: `${process.env.QUEUE_TEST_RUN}-command-timeout`,
    queueBackend: 'redis',
    connection: caller,
  });
  const producer = service.producer('jobs');
  try {
    await service.setup();
    await control.call('CLIENT', 'PAUSE', '5000', 'WRITE');
    await expect(producer.publish('uncertain', {})).rejects.toThrow(
      'Command timed out',
    );
    expect(caller.options.commandTimeout).toBe(100);
    await control.call('CLIENT', 'UNPAUSE');
    await expect(producer.publish('after', {})).resolves.toMatchObject({
      jobId: expect.any(String),
    });
  } finally {
    await control.call('CLIENT', 'UNPAUSE');
    await service.shutdown();
    await caller.quit();
    await control.quit();
  }
});
