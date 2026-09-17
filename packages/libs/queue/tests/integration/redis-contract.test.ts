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

it.skipIf(selectedBackend() !== 'redis')(
  'resumes persisted waiting and delayed jobs in a new service',
  async () => {
    const options = {
      namespace: `${process.env.QUEUE_TEST_RUN}-restart`,
      queueBackend: 'redis' as const,
      connection: {
        host: '127.0.0.1',
        port: Number(process.env.QUEUE_TEST_REDIS_PORT),
      },
    };
    const first = createQueueService(options);
    const producer = first.producer('jobs');
    const second = createQueueService(options);
    const messages: string[] = [];
    second.consumer('jobs').consume(async (channel) => {
      messages.push(channel);
    });
    try {
      await first.setup();
      await producer.publish('waiting', {});
      await producer.publish('delayed', {}, { delay: 200 });
      await first.shutdown();
      await second.setup();
      await expect
        .poll(() => messages, { timeout: 5000 })
        .toEqual(['waiting', 'delayed']);
    } finally {
      await Promise.all([first.shutdown(), second.shutdown()]);
    }
  },
);

it.skipIf(selectedBackend() !== 'redis')(
  'applies one global rate window across two services',
  async () => {
    const options = {
      namespace: `${process.env.QUEUE_TEST_RUN}-rate`,
      queueBackend: 'redis' as const,
      connection: {
        host: '127.0.0.1',
        port: Number(process.env.QUEUE_TEST_REDIS_PORT),
      },
      rateLimit: { max: 1, duration: 300 },
    };
    const first = createQueueService(options);
    const second = createQueueService(options);
    const starts: number[] = [];
    first.consumer('jobs').consume(async () => {
      starts.push(performance.now());
    });
    second.consumer('jobs').consume(async () => {
      starts.push(performance.now());
    });
    try {
      await Promise.all([first.setup(), second.setup()]);
      await first
        .producer('jobs')
        .publishMany(
          [1, 2, 3].map((message) => ({ channel: 'rate', message })),
        );
      await expect.poll(() => starts.length, { timeout: 5000 }).toBe(3);
      expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(270);
      expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(270);
    } finally {
      await Promise.all([first.shutdown(), second.shutdown()]);
    }
  },
);

it.skipIf(selectedBackend() !== 'redis')(
  'drains shared waiting and delayed jobs without affecting another namespace',
  async () => {
    const { Queue } = await import('bullmq');
    const { createQueueIdentity } = await import('../../src/identity.js');
    const connection = {
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_REDIS_PORT),
    };
    const namespace = `${process.env.QUEUE_TEST_RUN}-drain`;
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
    const producer = first.producer('jobs');
    second.manager('jobs');
    const other = isolated.producer('jobs');
    const identity = createQueueIdentity(namespace, 'jobs');
    const observer = new Queue(identity.redisQueueName, {
      connection,
      prefix: identity.redisPrefix,
    });
    try {
      await Promise.all([first.setup(), second.setup(), isolated.setup()]);
      const waiting = await producer.publish('waiting', {});
      const delayed = await producer.publish('delayed', {}, { delay: 60000 });
      await other.publish('isolated', {});
      await second.manager('jobs').drain();
      expect(await observer.getJobState(waiting.jobId)).toBe('unknown');
      expect(await observer.getJobState(delayed.jobId)).toBe('delayed');
      await second.manager('jobs').drain({ delayed: true });
      expect(await observer.getJobState(delayed.jobId)).toBe('unknown');
      const received: string[] = [];
      isolated.consumer('jobs').consume(async (channel) => {
        received.push(channel);
      });
      await expect.poll(() => received).toEqual(['isolated']);
    } finally {
      await observer.close();
      await Promise.all([
        first.shutdown(),
        second.shutdown(),
        isolated.shutdown(),
      ]);
    }
  },
);

it.skipIf(selectedBackend() !== 'redis')(
  'cancels only the local active dispatch and prevents retries',
  async () => {
    const { Queue } = await import('bullmq');
    const { createQueueIdentity } = await import('../../src/identity.js');
    const namespace = `${process.env.QUEUE_TEST_RUN}-cancel`;
    const connection = {
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_REDIS_PORT),
    };
    const options = {
      namespace,
      connection,
      queueBackend: 'redis' as const,
      attempts: 3,
    };
    const owner = createQueueService(options);
    const remote = createQueueService(options);
    let signal: AbortSignal | undefined;
    let calls = 0;
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    owner
      .consumer('jobs')
      .consume(async (_channel, _message, currentSignal) => {
        calls++;
        signal = currentSignal;
        await gate;
      });
    remote.manager('jobs');
    const identity = createQueueIdentity(namespace, 'jobs');
    const observer = new Queue(identity.redisQueueName, {
      connection,
      prefix: identity.redisPrefix,
    });
    try {
      await Promise.all([owner.setup(), remote.setup()]);
      const receipt = await owner.producer('jobs').publish('event', {});
      await expect.poll(() => calls).toBe(1);
      expect(remote.manager('jobs').cancelJob(receipt.jobId)).toBe(false);
      expect(signal?.aborted).toBe(false);
      expect(owner.manager('jobs').cancelJob(receipt.jobId)).toBe(true);
      expect(signal?.aborted).toBe(true);
      release();
      await expect
        .poll(() => observer.getJobState(receipt.jobId))
        .toBe('failed');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(calls).toBe(1);
      expect(await observer.getJobState(receipt.jobId)).toBe('failed');
    } finally {
      release();
      await Promise.all([owner.shutdown(), remote.shutdown()]);
      await observer.close();
    }
  },
);
