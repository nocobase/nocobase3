import { Queue } from 'bullmq';
import type { IQueueBackend } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';

describe('memory completion protocol', () => {
  it('retains the last two completions when three finish in one millisecond', async () => {
    const factory = createInMemoryBackendFactory();
    const queue = new Queue('ties', { connection: {} }, factory);
    const backend = factory('ties', { connection: {} });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10000);
    try {
      const jobs = await queue.addBulk(
        ['a', 'b', 'c'].map((name) => ({ name, data: {} })),
      );
      for (const job of jobs) {
        await backend.moveToActive('token');
        await backend.moveToCompleted(job, {}, 2, 'token', false);
      }
      expect(await queue.getJob(jobs[0]!.id!)).toBeUndefined();
      expect(await queue.getJobState(jobs[1]!.id!)).toBe('completed');
      expect(await queue.getJobState(jobs[2]!.id!)).toBe('completed');
    } finally {
      clock.mockRestore();
      await Promise.all([queue.close(), backend.close()]);
    }
  });
  it('applies age retention lazily on completion without pruning the failed partition', async () => {
    const factory = createInMemoryBackendFactory();
    const queue = new Queue('age', { connection: {} }, factory);
    const backend = factory('age', { connection: {} });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10000);
    try {
      const old = await queue.add('old', {});
      await backend.moveToActive('token');
      await backend.moveToCompleted(old, {}, false, 'token', false);
      const failed = await queue.add('failed', {});
      await backend.moveToActive('token');
      await backend.moveToFailed(failed, 'failure', false, 'token', false);
      clock.mockReturnValue(12001);
      expect(await queue.getJobState(old.id!)).toBe('completed');
      const fresh = await queue.add('fresh', {});
      await backend.moveToActive('token');
      await backend.moveToCompleted(fresh, {}, { age: 1 }, 'token', false);
      expect(await queue.getJob(old.id!)).toBeUndefined();
      expect(await queue.getJobState(fresh.id!)).toBe('completed');
      expect(await queue.getJobState(failed.id!)).toBe('failed');
    } finally {
      clock.mockRestore();
      await Promise.all([queue.close(), backend.close()]);
    }
  });
  it.each([true, 0, 1])(
    'applies completion retention %s without removing waiting jobs',
    async (retention) => {
      const factory = createInMemoryBackendFactory();
      const queue = new Queue('retention', { connection: {} }, factory);
      const backend = factory('retention', { connection: {} });
      try {
        const first = await queue.add('first', {}, { jobId: 'first' });
        const second = await queue.add('second', {});
        const waiting = await queue.add('waiting', {});
        await backend.moveToActive('token');
        await backend.moveToCompleted(first, {}, retention, 'token', false);
        await backend.moveToActive('token');
        await backend.moveToCompleted(second, {}, retention, 'token', false);
        expect(await queue.getJob(first.id!)).toBeUndefined();
        expect(await queue.getJobState(second.id!)).toBe(
          retention === 1 ? 'completed' : 'unknown',
        );
        expect(await queue.getJobState(waiting.id!)).toBe('waiting');
        expect((await queue.add('reused', {}, { jobId: 'first' })).id).toBe(
          'first',
        );
      } finally {
        await Promise.all([queue.close(), backend.close()]);
      }
    },
  );
  it.each([false, true])(
    'finishes with persisted result and fetchNext=%s',
    async (fetchNext) => {
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
      const backend = factory('jobs', { connection: {} });
      try {
        const first = await queue.add('first', {});
        const second = await queue.add('second', {});
        await backend.moveToActive('token');
        await expect(
          backend.moveToCompleted(
            first,
            { ok: true },
            false,
            'wrong',
            fetchNext,
          ),
        ).rejects.toThrow(/token|lock/u);
        expect(await backend.getState(first.id!)).toBe('active');
        const finished = await backend.moveToCompleted(
          first,
          { ok: true },
          false,
          'token',
          fetchNext,
        );
        expect(finished.finishedOn).toBeGreaterThan(0);
        expect(await backend.getJobData(first.id!)).toMatchObject({
          returnvalue: '{"ok":true}',
          attemptsMade: 1,
          finishedOn: finished.finishedOn,
        });
        expect(await backend.getState(first.id!)).toBe('completed');
        expect(await backend.getState(second.id!)).toBe(
          fetchNext ? 'active' : 'waiting',
        );
        if (fetchNext)
          expect(finished.result).toEqual([
            expect.objectContaining({ id: second.id }),
            second.id,
            0,
            0,
          ]);
        else expect(finished.result).toBeUndefined();
      } finally {
        await Promise.allSettled([queue.close(), backend.close()]);
      }
    },
  );

  it('persists a terminal failure and releases its lock', async () => {
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
    const backend = factory('jobs', { connection: {} });
    try {
      const job = await queue.add('event', {});
      await backend.moveToActive('owner');
      const result = await backend.moveToFailed(
        job,
        'business failure',
        false,
        'owner',
        false,
      );
      expect(await backend.getState(job.id!)).toBe('failed');
      expect(await backend.getJobData(job.id!)).toMatchObject({
        failedReason: 'business failure',
        attemptsMade: 1,
        finishedOn: result.finishedOn,
      });
      expect(await backend.extendLocks([job.id!], ['owner'], 100)).toEqual([
        job.id,
      ]);
    } finally {
      await Promise.allSettled([queue.close(), backend.close()]);
    }
  });
  it('makes finish-next visible as one synchronous state transition', async () => {
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
    const backend = factory('jobs', { connection: {} });
    try {
      const first = await queue.add('first', {});
      const second = await queue.add('second', {});
      await backend.moveToActive('owner');
      const finish = backend.moveToCompleted(first, null, false, 'owner', true);
      const observed = backend.getState(second.id!);
      await finish;
      expect(await observed).toBe('active');
    } finally {
      await Promise.allSettled([queue.close(), backend.close()]);
    }
  });
  it('accepts the failure fields emitted by the real BullMQ Job API', async () => {
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
    try {
      const job = await queue.add('event', {});
      await queue.getBackend().moveToActive('owner');
      await job.moveToFailed(new Error('business failure'), 'owner', false);
      const stored = await queue.getJob(job.id!);
      expect(await stored?.getState()).toBe('failed');
      expect(stored?.failedReason).toBe('business failure');
      expect(stored?.stacktrace?.join('\n')).toContain('business failure');
    } finally {
      await queue.close();
    }
  });
});
