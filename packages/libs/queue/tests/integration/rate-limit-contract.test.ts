import { Queue } from 'bullmq';
import { expect, it } from 'vitest';
import {
  createQueueService,
  type QueueOptions,
  type QueueService,
} from '../../src/index.js';
import { createQueueIdentity } from '../../src/identity.js';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';
import {
  createBackendHarness,
  selectedBackend,
  type BackendHarness,
} from '../helpers/backend-harness.js';

const backend = selectedBackend();
if (backend !== 'inMemory' && backend !== 'redis' && backend !== 'cluster')
  throw new Error('This rate contract targets memory, Redis and Cluster only');

function instance(harness: BackendHarness, options: Partial<QueueOptions>) {
  // One factory per service preserves memory isolation; only its observer shares it.
  const factory = createInMemoryBackendFactory();
  const service = createQueueService({
    ...options,
    namespace: harness.namespace,
    connection: harness.connection,
    queueBackend: backend === 'inMemory' ? 'observed-memory' : 'redis',
  });
  if (backend === 'inMemory')
    service.registerBackend('observed-memory', factory);
  const identity = createQueueIdentity(harness.namespace, 'jobs');
  const observer = new Queue(
    identity.redisQueueName,
    { connection: harness.connection, prefix: identity.redisPrefix },
    backend === 'inMemory' ? factory : harness.factory,
  );
  service.manager('jobs');
  return { service, observer };
}

async function closeAll(operations: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(operations);
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      'Rate contract resources failed to close',
    );
}

async function withInstances(
  run: (
    create: (options: Partial<QueueOptions>) => ReturnType<typeof instance>,
  ) => Promise<void>,
): Promise<void> {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const services: QueueService[] = [];
  const observers: ReturnType<typeof instance>['observer'][] = [];
  try {
    await run((options) => {
      const created = instance(harness, options);
      services.push(created.service);
      observers.push(created.observer);
      return created;
    });
  } finally {
    try {
      await closeAll(services.map((service) => service.shutdown()));
    } finally {
      try {
        await closeAll(observers.map((observer) => observer.close()));
      } finally {
        await harness.close();
      }
    }
  }
}

if (backend === 'inMemory') {
  it.each([{ max: 2, duration: 1000 }, null])(
    'applies a pre-setup manual rate override (%j) to actual memory handler starts',
    async (rateLimit) => {
      await withInstances(async (create) => {
        const fileOptions = {
          rateLimit: { max: 1, duration: 20000 },
          queues: { jobs: { rateLimit: { max: 1, duration: 10000 } } },
        };
        const { service } = create(fileOptions);
        const starts: number[] = [];
        service.consumer('jobs').consume(async () => {
          starts.push(performance.now());
        });
        await service.manager('jobs').configure({ rateLimit });
        await service.setup();
        await service
          .producer('jobs')
          .publishMany(
            [1, 2, 3].map((message) => ({ channel: 'work', message })),
          );
        await expect.poll(() => starts.length, { timeout: 5000 }).toBe(3);
        // A full second window leaves 250 ms of scheduling tolerance. The
        // first pair must run together, rather than retaining either file limit.
        expect(starts[1]! - starts[0]!).toBeLessThan(750);
        if (rateLimit)
          expect(starts[2]! - starts[0]!).toBeGreaterThanOrEqual(750);
        else expect(starts[2]! - starts[0]!).toBeLessThan(750);
        expect(fileOptions.queues.jobs.rateLimit).toEqual({
          max: 1,
          duration: 10000,
        });
      });
    },
  );

  it('keeps rate startup and runtime writes isolated between memory services with identical identities', async () => {
    await withInstances(async (create) => {
      const first = create({ rateLimit: { max: 1, duration: 10000 } });
      const firstStarts: unknown[] = [];
      first.service.consumer('jobs').consume(async (_channel, message) => {
        firstStarts.push(message);
      });
      await first.service.setup();
      await first.service.manager('jobs').configure({
        rateLimit: { max: 2, duration: 10000 },
      });
      const second = create({ rateLimit: { max: 3, duration: 10000 } });
      const secondStarts: unknown[] = [];
      second.service.consumer('jobs').consume(async (_channel, message) => {
        secondStarts.push(message);
      });
      await second.service.setup();
      await first.service.producer('jobs').publishMany(
        ['first-1', 'first-2', 'first-3'].map((message) => ({
          channel: 'work',
          message,
        })),
      );
      await second.service.producer('jobs').publishMany(
        ['second-1', 'second-2', 'second-3', 'second-4'].map((message) => ({
          channel: 'work',
          message,
        })),
      );
      await expect
        .poll(() => [firstStarts.length, secondStarts.length], {
          timeout: 2000,
        })
        .toEqual([2, 3]);
      // Keep excess jobs queued long enough to detect a missing limiter.
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(firstStarts).toEqual(['first-1', 'first-2']);
      expect(secondStarts).toEqual(['second-1', 'second-2', 'second-3']);
    });
  });
} else {
  it.each([{ max: 3, duration: 333 }, null])(
    'applies a pre-setup manual rate override (%j) instead of file defaults',
    async (rateLimit) => {
      await withInstances(async (create) => {
        const fileOptions = {
          rateLimit: { max: 1, duration: 111 },
          queues: { jobs: { rateLimit: { max: 2, duration: 222 } } },
        };
        const { service, observer } = create(fileOptions);
        await service.manager('jobs').configure({ rateLimit });
        await service.setup();
        expect(await observer.getGlobalRateLimit()).toEqual(rateLimit);
        expect(fileOptions.queues.jobs.rateLimit).toEqual({
          max: 2,
          duration: 222,
        });
      });
    },
  );

  it('uses the last successful startup or runtime rate write on a shared external queue', async () => {
    await withInstances(async (create) => {
      const first = create({ rateLimit: { max: 1, duration: 111 } });
      await first.service.setup();
      await first.service.manager('jobs').configure({
        rateLimit: { max: 2, duration: 222 },
      });
      expect(await first.observer.getGlobalRateLimit()).toEqual({
        max: 2,
        duration: 222,
      });

      // A genuinely new instance's explicit file setting overwrites runtime policy.
      const second = create({ rateLimit: { max: 3, duration: 333 } });
      await second.service.setup();
      expect(await first.observer.getGlobalRateLimit()).toEqual({
        max: 3,
        duration: 333,
      });
      await first.service.manager('jobs').configure({
        concurrency: 2,
        rateLimit: undefined,
      });
      expect(await second.observer.getGlobalRateLimit()).toEqual({
        max: 3,
        duration: 333,
      });
      await first.service.manager('jobs').configure({
        rateLimit: { max: 4, duration: 444 },
      });
      expect(await second.observer.getGlobalRateLimit()).toEqual({
        max: 4,
        duration: 444,
      });

      const omitted = create({});
      await omitted.service.setup();
      expect(await omitted.observer.getGlobalRateLimit()).toEqual({
        max: 4,
        duration: 444,
      });
      await second.service.manager('jobs').configure({ rateLimit: null });
      expect(await first.observer.getGlobalRateLimit()).toBeNull();
      await first.service.manager('jobs').configure({
        rateLimit: { max: 5, duration: 555 },
      });
      expect(await second.observer.getGlobalRateLimit()).toEqual({
        max: 5,
        duration: 555,
      });
      const removed = create({ rateLimit: null });
      await removed.service.setup();
      expect(await first.observer.getGlobalRateLimit()).toBeNull();
    });
  });
}
