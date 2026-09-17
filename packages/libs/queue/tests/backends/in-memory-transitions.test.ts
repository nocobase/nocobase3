import { Queue } from 'bullmq';
import type { IQueueBackend } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';

describe('memory completion protocol', () => {
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
});
