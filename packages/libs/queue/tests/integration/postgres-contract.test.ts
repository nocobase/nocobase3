import { expect, it } from 'vitest';
import { Queue } from 'bullmq';
import { createQueueService } from '../../src/service.js';
import { createQueueIdentity } from '../../src/identity.js';
import { selectedBackend } from '../helpers/backend-harness.js';

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'competes across PostgreSQL services and isolates namespaces',
  async () => {
    const connection = {
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_PG_PORT),
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
    };
    const namespace = `${process.env.QUEUE_TEST_RUN}-competition`;
    const first = createQueueService({
      namespace,
      queueBackend: 'postgres',
      connection,
    });
    const second = createQueueService({
      namespace,
      queueBackend: 'postgres',
      connection,
    });
    const isolated = createQueueService({
      namespace: `${namespace}-other`,
      queueBackend: 'postgres',
      connection,
    });
    const counts = new Map<unknown, number>();
    const started = new Set<string>();
    const other: unknown[] = [];
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    for (const [name, service] of [
      ['first', first],
      ['second', second],
    ] as const) {
      service.consumer('jobs').consume(async (_channel, value) => {
        started.add(name);
        await gate;
        counts.set(value, (counts.get(value) ?? 0) + 1);
      });
    }
    isolated.consumer('jobs').consume(async (_channel, value) => {
      other.push(value);
    });
    try {
      await Promise.all([first.setup(), second.setup(), isolated.setup()]);
      await first.producer('jobs').publishMany(
        Array.from({ length: 20 }, (_, message) => ({
          channel: 'work',
          message,
        })),
      );
      await expect.poll(() => started.size, { timeout: 5000 }).toBe(2);
      release();
      await expect.poll(() => counts.size, { timeout: 5000 }).toBe(20);
      expect([...counts.values()]).toEqual(Array.from({ length: 20 }, () => 1));
      await isolated.producer('jobs').publish('work', 'isolated');
      await expect.poll(() => other).toEqual(['isolated']);
      expect(counts.has('isolated')).toBe(false);
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

it.skipIf(!['postgres', 'postgres13'].includes(selectedBackend()))(
  'executes PostgreSQL delayed retry and drains pending delayed jobs',
  async () => {
    const connection = {
      host: '127.0.0.1',
      port: Number(process.env.QUEUE_TEST_PG_PORT),
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
    };
    const namespace = `${process.env.QUEUE_TEST_RUN}-retry`;
    const service = createQueueService({
      namespace,
      queueBackend: 'postgres',
      connection,
      attempts: 2,
      backoff: { type: 'fixed', delay: 100 },
    });
    let calls = 0;
    service.consumer('jobs').consume(async () => {
      if (++calls === 1) throw new Error('Retry fixture');
    });
    const identity = createQueueIdentity(namespace, 'jobs');
    const { createPostgresBackend } = await import('bullmq');
    const observer = new Queue(
      identity.postgresQueueName,
      { connection },
      createPostgresBackend,
    );
    try {
      await service.setup();
      const receipt = await service
        .producer('jobs')
        .publish('work', {}, { delay: 100 });
      await expect
        .poll(() => observer.getJobState(receipt.jobId), { timeout: 5000 })
        .toBe('completed');
      expect(calls).toBe(2);
      const waiting = await service
        .producer('jobs')
        .publish('later', {}, { delay: 60000 });
      await service.manager('jobs').drain({ delayed: true });
      expect(await observer.getJobState(waiting.jobId)).toBe('unknown');
    } finally {
      await observer.close();
      await service.shutdown();
    }
  },
);
