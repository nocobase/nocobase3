import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { expect, it } from 'vitest';
import { createQueueIdentity } from '../../src/identity.js';
import { createQueueService } from '../../src/service.js';
import {
  createBackendHarness,
  selectedBackend,
} from '../helpers/backend-harness.js';
import { createTcpProxy } from '../helpers/tcp-proxy.js';

it.skipIf(selectedBackend() !== 'redis')(
  'recovers an active job after bounded shutdown closes owned sockets while its handler remains blocked',
  async () => {
    const harness = await createBackendHarness();
    try {
      if (!(harness.connection instanceof Redis))
        throw new Error(
          'Active recovery requires an independent Redis observer',
        );
      const redis = harness.connection;
      const proxy = await createTcpProxy(
        Number(process.env.QUEUE_TEST_REDIS_PORT),
      );
      try {
        const options = {
          namespace: harness.namespace,
          queueBackend: 'redis' as const,
          attempts: 3,
          removeOnComplete: false,
          removeOnFail: false,
          // Only lifecycle budgets are shortened, never lock or stalled timing.
          shutdownTimeoutMs: 100,
          cancellationGraceMs: 100,
        };
        const original = createQueueService({
          ...options,
          connection: { host: '127.0.0.1', port: proxy.port },
        });
        const replacement = createQueueService({
          ...options,
          connection: {
            host: '127.0.0.1',
            port: Number(process.env.QUEUE_TEST_REDIS_PORT),
          },
        });
        const identity = createQueueIdentity(harness.namespace, 'jobs');
        // Neither the observer nor the replacement passes through the proxy.
        const observer = new Queue(
          identity.redisQueueName,
          {
            connection: redis,
            prefix: identity.redisPrefix,
            skipMetasUpdate: true,
          },
          harness.factory,
        );
        observer.on('error', () => {});
        let release = (): void => {};
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let originalSignal: AbortSignal | undefined;
        let originalCalls = 0;
        let originalExited = false;
        const unregister = original
          .consumer('jobs')
          .consume(async (_channel, _message, signal) => {
            originalCalls++;
            originalSignal = signal;
            // Deliberately ignore shutdown cancellation until recovery finishes.
            await gate;
            originalExited = true;
          });
        const recovered: {
          channel: string;
          message: unknown;
          signal: AbortSignal;
        }[] = [];
        replacement
          .consumer('jobs')
          .consume(async (channel, message, signal) => {
            recovered.push({ channel, message, signal });
          });
        const producer = original.producer('jobs');
        try {
          await observer.waitUntilReady();
          await original.setup();
          const payload = { work: 'survives-uncooperative-shutdown' };
          const receipt = await producer.publish('recover', payload);
          await expect.poll(() => originalCalls, { timeout: 5000 }).toBe(1);
          expect(originalSignal?.aborted).toBe(false);
          expect(await observer.getJobState(receipt.jobId)).toBe('active');
          expect(await observer.getJob(receipt.jobId)).toMatchObject({
            id: receipt.jobId,
            attemptsStarted: 1,
            attemptsMade: 0,
            stalledCounter: 0,
            opts: { attempts: 3 },
          });
          await expect.poll(() => proxy.sockets.size).toBeGreaterThanOrEqual(6);

          const started = performance.now();
          let shutdownSettled = false;
          const closing = original.shutdown().finally(() => {
            shutdownSettled = true;
          });
          // Observe rejection immediately, even if a subsequent deadline assertion fails.
          void closing.catch(() => {});
          await expect
            .poll(() => shutdownSettled, { timeout: 7000 })
            .toBe(true);
          expect(performance.now() - started).toBeLessThan(7000);
          await expect(closing).rejects.toBeInstanceOf(AggregateError);
          await expect(closing).rejects.toMatchObject({
            message: 'Queue shutdown failed',
            errors: expect.arrayContaining([
              expect.objectContaining({
                message:
                  'Queue shutdown grace expired; handlers or job transitions may still be running',
              }),
            ]),
          });
          expect(originalSignal?.aborted).toBe(true);
          expect(originalSignal?.reason).toBe('Queue service shutdown');
          expect(originalExited).toBe(false);
          await expect(producer.publish('too-late', {})).rejects.toThrow(
            'Queue service is closed',
          );

          // The proxy remains pass-through and listening. No disconnect/close can
          // manufacture this evidence that QueueService released every owned socket.
          await expect
            .poll(() => proxy.sockets.size, { timeout: 2000 })
            .toBe(0);
          expect(await redis.ping()).toBe('PONG');
          expect(await observer.getJobState(receipt.jobId)).toBe('active');
          const lockKey = observer.toKey(`${receipt.jobId}:lock`);
          const observedAt = performance.now();
          const remainingLockMs = await redis.pttl(lockKey);
          expect(remainingLockMs).toBeGreaterThan(20000);
          expect(remainingLockMs).toBeLessThanOrEqual(30000);

          // No DEL, expiry override, manual stalled scan, or private Worker hooks:
          // the abandoned lock must expire on Redis's real 30-second default.
          await expect
            .poll(() => redis.pttl(lockKey), { timeout: 35000, interval: 250 })
            .toBe(-2);
          expect(performance.now() - observedAt).toBeGreaterThanOrEqual(
            remainingLockMs - 250,
          );
          expect(await observer.getJobState(receipt.jobId)).toBe('active');
          expect(await observer.getJob(receipt.jobId)).toMatchObject({
            id: receipt.jobId,
            attemptsStarted: 1,
            attemptsMade: 0,
            stalledCounter: 0,
          });
          expect(originalExited).toBe(false);
          expect(proxy.sockets.size).toBe(0);
          expect(recovered).toEqual([]);

          // Same Redis target, namespace and logical queue; no new publication.
          // Allow two default 30-second stalled-check passes to mark and reclaim.
          await replacement.setup();
          await expect
            .poll(() => observer.getJobState(receipt.jobId), {
              timeout: 65000,
              interval: 250,
            })
            .toBe('completed');
          expect(recovered).toHaveLength(1);
          expect(recovered[0]).toMatchObject({
            channel: 'recover',
            message: payload,
          });
          expect(recovered[0]?.signal.aborted).toBe(false);
          expect(await observer.getJob(receipt.jobId)).toMatchObject({
            id: receipt.jobId,
            name: 'recover',
            stalledCounter: 1,
            attemptsStarted: 2,
            // The abandoned claim consumed no failure attempt; completion counts once.
            attemptsMade: 1,
            opts: { attempts: 3 },
          });
          expect(
            await observer.getJobCounts(
              'active',
              'waiting',
              'completed',
              'failed',
            ),
          ).toEqual({
            active: 0,
            waiting: 0,
            completed: 1,
            failed: 0,
          });
          // Shutdown's abort was not permanent user cancellation, and recovery did
          // not depend on the old handler returning or its transports reconnecting.
          expect(originalCalls).toBe(1);
          expect(originalExited).toBe(false);
          expect(proxy.sockets.size).toBe(0);
        } finally {
          release();
          try {
            await unregister();
            await original.shutdown().catch(() => {});
          } finally {
            try {
              await replacement.shutdown();
            } finally {
              await observer.close();
            }
          }
        }
      } finally {
        await proxy.close();
      }
    } finally {
      await harness.close();
    }
  },
  120000,
);
