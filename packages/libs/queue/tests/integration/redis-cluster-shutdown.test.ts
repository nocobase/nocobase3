import { Queue } from 'bullmq';
import { expect, it } from 'vitest';
import { createQueueIdentity } from '../../src/identity.js';
import { createQueueService } from '../../src/service.js';
import {
  createBackendHarness,
  observeTestOperation,
} from '../helpers/backend-harness.js';

it('drains the original unregister pause before resuming a replacement Cluster handler', async () => {
  const harness = await createBackendHarness();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend: 'redis',
    connection: harness.connection,
    shutdownTimeoutMs: 1000,
    cancellationGraceMs: 100,
  });
  const identity = createQueueIdentity(harness.namespace, 'jobs');
  const observer = new Queue(identity.redisQueueName, {
    connection: harness.connection,
    prefix: identity.redisPrefix,
  });
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const oldMessages: unknown[] = [];
  const newMessages: unknown[] = [];
  const unregister = service
    .consumer('jobs')
    .consume(async (_channel, message) => {
      oldMessages.push(message);
      await gate;
    });
  const producer = service.producer('jobs');
  let off: Promise<void> | undefined;
  const failures: unknown[] = [];
  try {
    await service.setup();
    const active = await service.producer('jobs').publish('active', 1);
    await expect.poll(() => oldMessages).toEqual([1]);
    let unregistered = false;
    off = unregister().then(() => {
      unregistered = true;
    });
    void off.catch(() => {});
    const replacementOff = service
      .consumer('jobs')
      .consume(async (_channel, message) => {
        newMessages.push(message);
      });
    const waiting = await service.producer('jobs').publish('waiting', 2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(unregistered).toBe(false);
    expect(newMessages).toEqual([]);
    release();
    await observeTestOperation(off, 'Cluster unregister drain');
    await expect.poll(() => newMessages, { timeout: 5000 }).toEqual([2]);
    await expect
      .poll(() => observer.getJobState(active.jobId))
      .toBe('completed');
    await expect
      .poll(() => observer.getJobState(waiting.jobId))
      .toBe('completed');
    expect(oldMessages).toEqual([1]);
    await observeTestOperation(
      replacementOff(),
      'Cluster replacement unregister',
    );
    const paused = await service.producer('jobs').publish('paused', 3);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(newMessages).toEqual([2]);
    expect(await observer.getJobState(paused.jobId)).toBe('waiting');
    await Promise.all([service.shutdown(), service.shutdown()]);
    await expect(producer.publish('closed', {})).rejects.toThrow();
  } catch (error) {
    failures.push(error);
  } finally {
    release();
    // Preserve business and cleanup failures independently. This observation
    // deadline does not cancel the original unregister or confirm cleanup.
    const cleanup = await Promise.allSettled([
      observeTestOperation(service.shutdown(), 'Cluster service cleanup', 8000),
      observer.close(),
    ]);
    for (const result of cleanup)
      if (result.status === 'rejected') failures.push(result.reason);
    try {
      await harness.close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      'Cluster unregister/resume or cleanup failed',
    );
});

it('coordinates idle unregister with shutdown without late Cluster business admission', async () => {
  const harness = await createBackendHarness();
  const options = {
    namespace: harness.namespace,
    queueBackend: 'redis' as const,
    connection: harness.connection,
    shutdownTimeoutMs: 1000,
    cancellationGraceMs: 100,
  };
  const service = createQueueService(options);
  const replacement = createQueueService(options);
  const received: unknown[] = [];
  let oldCalls = 0;
  const off = service.consumer('jobs').consume(async () => {
    oldCalls++;
  });
  replacement.consumer('jobs').consume(async (_channel, message) => {
    received.push(message);
  });
  try {
    await service.setup();
    await observeTestOperation(
      Promise.all([off(), service.shutdown()]),
      'Cluster idle unregister and shutdown',
      8000,
    );
    // A separate service publishes after shutdown; the old Worker must stay stopped.
    await replacement.setup();
    await replacement.producer('jobs').publish('after', 'replacement');
    await expect.poll(() => received).toEqual(['replacement']);
    expect(oldCalls).toBe(0);
  } finally {
    try {
      await service.shutdown();
    } finally {
      try {
        await replacement.shutdown();
      } finally {
        await harness.close();
      }
    }
  }
});
