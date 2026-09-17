import { expect, it } from 'vitest';
import { createQueueService } from '../../src/service.js';
import {
  createBackendHarness,
  selectedBackend,
} from '../helpers/backend-harness.js';

it.skipIf(selectedBackend() !== 'cluster')(
  'uses owned Cluster duplicates for Unicode queue identity and bulk work',
  async () => {
    const harness = await createBackendHarness();
    const { Cluster } = await import('ioredis');
    if (!(harness.connection instanceof Cluster))
      throw new Error('Expected Cluster fixture');
    const owner = harness.connection;
    const { createQueueIdentity } = await import('../../src/identity.js');
    const clientIds = async (): Promise<string[]> => {
      const rows = await Promise.all(
        owner.nodes('master').map(async (node, index) => {
          const list = await node.client('LIST');
          if (typeof list !== 'string')
            throw new Error('Expected CLIENT LIST text');
          return list
            .trim()
            .split('\n')
            .map((line) => `${index}:${line.split(' ')[0]}`);
        }),
      );
      return rows.flat().sort();
    };
    await Promise.all(owner.nodes('master').map((node) => node.ping()));
    const before = await clientIds();
    const service = createQueueService({
      namespace: `${harness.namespace}-应用{one}`,
      queueBackend: 'redis',
      connection: harness.connection,
    });
    const received: unknown[] = [];
    service.consumer('任务:队列{two}').consume(async (_channel, message) => {
      received.push(message);
    });
    const producer = service.producer('任务:队列{two}');
    try {
      await service.setup();
      await producer.publishMany([
        { channel: 'event', message: 1 },
        { channel: 'event', message: 2 },
      ]);
      await expect.poll(() => received, { timeout: 5000 }).toEqual([1, 2]);
      const identity = createQueueIdentity(
        `${harness.namespace}-应用{one}`,
        '任务:队列{two}',
      );
      const keys = (
        await Promise.all(
          owner
            .nodes('master')
            .map((node) => node.keys(`${identity.redisPrefix}:*`)),
        )
      ).flat();
      expect(keys.length).toBeGreaterThan(0);
      expect(
        keys.every((key) =>
          key.startsWith(`${identity.redisPrefix}:${identity.redisQueueName}:`),
        ),
      ).toBe(true);
      const slots = await Promise.all(
        keys.map((key) => owner.cluster('KEYSLOT', key)),
      );
      expect(new Set(slots).size).toBe(1);
      const queueSlots = new Set<unknown>(slots);
      for (const name of ['other-a', 'other-b', 'other-c']) {
        const receipt = await service.producer(name).publish('event', {});
        const other = createQueueIdentity(
          `${harness.namespace}-应用{one}`,
          name,
        );
        const jobKey = `${other.redisPrefix}:${other.redisQueueName}:${receipt.jobId}`;
        expect(await owner.exists(jobKey)).toBe(1);
        queueSlots.add(await owner.cluster('KEYSLOT', jobKey));
      }
      expect(queueSlots.size).toBeGreaterThan(1);
      await service.shutdown();
      await expect.poll(clientIds, { timeout: 5000 }).toEqual(before);
      expect(await owner.ping()).toBe('PONG');
    } finally {
      await service.shutdown().catch(() => {});
      await harness.close();
    }
  },
);

it.skipIf(selectedBackend() !== 'cluster')(
  'executes delay, retry, rate limits and drain without CROSSSLOT',
  async () => {
    const harness = await createBackendHarness();
    const { Queue } = await import('bullmq');
    const { createQueueIdentity } = await import('../../src/identity.js');
    const service = createQueueService({
      namespace: harness.namespace,
      queueBackend: 'redis',
      connection: harness.connection,
      rateLimit: { max: 1, duration: 150 },
      attempts: 2,
      backoff: { type: 'fixed', delay: 50 },
    });
    const calls = new Map<string, number>();
    const starts: number[] = [];
    service.consumer('scheduled').consume(async (channel) => {
      starts.push(performance.now());
      const count = (calls.get(channel) ?? 0) + 1;
      calls.set(channel, count);
      if (channel === 'retry' && count === 1) throw new Error('Retry fixture');
    });
    const producer = service.producer('scheduled');
    const identity = createQueueIdentity(harness.namespace, 'scheduled');
    const observer = new Queue(identity.redisQueueName, {
      connection: harness.connection,
      prefix: identity.redisPrefix,
    });
    try {
      await service.setup();
      const retry = await producer.publish('retry', {});
      const delayed = await producer.publish('delayed', {}, { delay: 100 });
      await expect
        .poll(() => observer.getJobState(retry.jobId), { timeout: 5000 })
        .toBe('completed');
      await expect
        .poll(() => observer.getJobState(delayed.jobId), { timeout: 5000 })
        .toBe('completed');
      expect(calls.get('retry')).toBe(2);
      expect(calls.get('delayed')).toBe(1);
      for (let i = 1; i < starts.length; i++)
        expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(120);
      const pending = await producer.publish('drained', {}, { delay: 60000 });
      await service.manager('scheduled').drain({ delayed: true });
      expect(await observer.getJobState(pending.jobId)).toBe('unknown');
    } finally {
      await observer.close();
      await service.shutdown().catch(() => {});
      await harness.close();
    }
  },
);
