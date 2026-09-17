import { Queue } from 'bullmq';
import type { IQueueBackend } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';

afterEach(() => vi.useRealTimers());

describe('memory stalled recovery', () => {
  it('marks first, recovers expired locks next, and defers failure past the configured maximum', async () => {
    vi.useFakeTimers();
    const factory = createInMemoryBackendFactory();
    const queue = new Queue<
      unknown,
      unknown,
      string,
      unknown,
      unknown,
      string,
      IQueueBackend
    >('jobs', { connection: {} }, factory);
    const backend = factory('jobs', {
      connection: {},
      ...{ lockDuration: 5, stalledInterval: 10, maxStalledCount: 1 },
    });
    try {
      const job = await queue.add('event', {});
      await backend.moveToActive('owner');
      await vi.advanceTimersByTimeAsync(6);
      expect(await backend.moveStalledJobsToWait()).toEqual([]);
      expect(await backend.getState(job.id!)).toBe('active');
      expect(await backend.moveStalledJobsToWait()).toEqual([]);
      await vi.advanceTimersByTimeAsync(10);
      expect(await backend.moveStalledJobsToWait()).toEqual([job.id]);
      expect(await backend.getState(job.id!)).toBe('waiting');
      await backend.moveToActive('second-owner');
      await vi.advanceTimersByTimeAsync(10);
      expect(await backend.moveStalledJobsToWait()).toEqual([]);
      await vi.advanceTimersByTimeAsync(10);
      expect(await backend.moveStalledJobsToWait()).toEqual([job.id]);
      expect(await backend.getJobData(job.id!)).toMatchObject({
        stalledCounter: 2,
        deferredFailure: 'job stalled more than allowable limit',
      });
      expect(await backend.getState(job.id!)).toBe('waiting');
    } finally {
      await Promise.allSettled([queue.close(), backend.close()]);
    }
  });

  it('does not recover jobs whose lock was renewed', async () => {
    vi.useFakeTimers();
    const factory = createInMemoryBackendFactory();
    const queue = new Queue<
      unknown,
      unknown,
      string,
      unknown,
      unknown,
      string,
      IQueueBackend
    >('jobs', { connection: {} }, factory);
    const backend = factory('jobs', {
      connection: {},
      ...{ lockDuration: 20, stalledInterval: 10 },
    });
    try {
      const job = await queue.add('event', {});
      await backend.moveToActive('owner');
      await backend.moveStalledJobsToWait();
      await vi.advanceTimersByTimeAsync(10);
      expect(await backend.extendLocks([job.id!], ['owner'], 50)).toEqual([]);
      expect(await backend.moveStalledJobsToWait()).toEqual([]);
      expect(await backend.getState(job.id!)).toBe('active');
    } finally {
      await Promise.allSettled([queue.close(), backend.close()]);
    }
  });
});
