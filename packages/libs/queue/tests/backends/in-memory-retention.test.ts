import { Queue, Worker } from 'bullmq';
import type { KeepJobs } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';

interface RetentionCase {
  name: string;
  policy: boolean | number | KeepJobs;
  retained: string[];
}

const policies: RetentionCase[] = [
  {
    name: 'false keeps history',
    policy: false,
    retained: ['a', 'b', 'c', 'fresh'],
  },
  {
    name: 'true removes only the current failure',
    policy: true,
    retained: ['a', 'b', 'c'],
  },
  {
    name: 'zero removes only the current failure',
    policy: 0,
    retained: ['a', 'b', 'c'],
  },
  { name: 'numeric count', policy: 1, retained: ['fresh'] },
  {
    name: 'object count and same-ms ordering',
    policy: { count: 2 },
    retained: ['c', 'fresh'],
  },
  {
    name: 'age includes the exact cutoff',
    policy: { age: 1 },
    retained: ['fresh'],
  },
  {
    name: 'zero age includes the current failure',
    policy: { age: 0 },
    retained: [],
  },
  {
    name: 'age cap zero',
    policy: { age: 1, limit: 0 },
    retained: ['a', 'b', 'c', 'fresh'],
  },
  {
    name: 'age cap one',
    policy: { age: 1, limit: 1 },
    retained: ['a', 'b', 'fresh'],
  },
  {
    name: 'age cap two',
    policy: { age: 1, limit: 2 },
    retained: ['a', 'fresh'],
  },
  {
    name: 'count after capped age pruning',
    policy: { age: 1, limit: 1, count: 2 },
    retained: ['b', 'fresh'],
  },
];

describe('memory failed-retention inverse partitions', () => {
  it.each(policies)(
    '$name leaves every nonfailed partition unchanged',
    async ({ policy, retained }) => {
      const factory = createInMemoryBackendFactory();
      const queue = new Queue('failed-retention', { connection: {} }, factory);
      const backend = queue.getBackend();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(100000);
      try {
        const completed = await queue.add(
          'completed',
          { sentinel: true },
          { jobId: 'completed' },
        );
        await backend.moveToActive('completed-owner');
        await backend.moveToCompleted(
          completed,
          'result',
          false,
          'completed-owner',
          false,
        );
        for (const id of ['a', 'b', 'c']) {
          const job = await queue.add(id, { original: id }, { jobId: id });
          expect((await backend.moveToActive('failure-owner'))[1]).toBe(id);
          await backend.moveToFailed(
            job,
            `failure-${id}`,
            false,
            'failure-owner',
            false,
          );
        }
        const fresh = await queue.add('fresh', {}, { jobId: 'fresh' });
        expect((await backend.moveToActive('fresh-owner'))[1]).toBe('fresh');
        await queue.add('active', { sentinel: true }, { jobId: 'active' });
        expect((await backend.moveToActive('active-owner'))[1]).toBe('active');
        await queue.add('waiting', { sentinel: true }, { jobId: 'waiting' });
        await queue.add(
          'delayed',
          { sentinel: true },
          { jobId: 'delayed', delay: 10000 },
        );
        const sentinelIds = ['completed', 'active', 'waiting', 'delayed'];
        const snapshots = await Promise.all(
          sentinelIds.map((id) => backend.getJobData(id)),
        );

        clock.mockReturnValue(101000);
        // Advancing the clock or reading history is not a retention trigger.
        for (const id of ['a', 'b', 'c'])
          expect(await queue.getJobState(id)).toBe('failed');
        await backend.moveToFailed(
          fresh,
          'fresh failure',
          policy,
          'fresh-owner',
          false,
        );
        for (const id of ['a', 'b', 'c', 'fresh']) {
          expect(await queue.getJobState(id)).toBe(
            retained.includes(id) ? 'failed' : 'unknown',
          );
          if (!retained.includes(id))
            expect(await queue.getJob(id)).toBeUndefined();
        }
        expect(
          await backend.getCounts([
            'completed',
            'active',
            'wait',
            'delayed',
            'failed',
          ]),
        ).toEqual([1, 1, 1, 1, retained.length]);
        expect(
          await Promise.all(sentinelIds.map((id) => backend.getJobData(id))),
        ).toEqual(snapshots);
        expect(
          await backend.extendLocks(['active'], ['active-owner'], 30000),
        ).toEqual([]);
        expect(
          await backend.extendLocks(['fresh'], ['fresh-owner'], 30000),
        ).toEqual(['fresh']);

        for (const id of ['a', 'b', 'c', 'fresh'].filter(
          (id) => !retained.includes(id),
        )) {
          await queue.add('replacement', { replacement: id }, { jobId: id });
          expect(await queue.getJobState(id)).toBe('waiting');
          expect((await queue.getJob(id))?.data).toEqual({ replacement: id });
          expect((await queue.getJob(id))?.attemptsMade).toBe(0);
        }
      } finally {
        clock.mockRestore();
        await queue.close();
      }
    },
  );

  it.each<RetentionCase>([
    { name: 'false', policy: false, retained: ['first', 'second'] },
    { name: 'true', policy: true, retained: [] },
    { name: 'zero', policy: 0, retained: [] },
    { name: 'count', policy: 1, retained: ['second'] },
    { name: 'age', policy: { age: 0 }, retained: [] },
  ])(
    'applies removeOnFail=$name through a real Worker',
    async ({ policy, retained }) => {
      const factory = createInMemoryBackendFactory();
      const queue = new Queue('worker-retention', { connection: {} }, factory);
      const backend = queue.getBackend();
      const errors: Error[] = [];
      const failures: string[] = [];
      const worker = new Worker(
        'worker-retention',
        async () => {
          throw new Error('business failure');
        },
        { connection: {}, autorun: false },
        factory,
      );
      worker.on('error', (error) => {
        errors.push(error);
      });
      worker.on('failed', (job) => {
        if (job?.id) failures.push(job.id);
      });
      let running: Promise<void> | undefined;
      try {
        const completed = await queue.add(
          'completed',
          {},
          { jobId: 'completed' },
        );
        await backend.moveToActive('owner');
        await backend.moveToCompleted(completed, 'kept', false, 'owner', false);
        const snapshot = await backend.getJobData('completed');
        for (const id of ['first', 'second'])
          await queue.add(
            id,
            {},
            { jobId: id, attempts: 1, removeOnFail: policy },
          );
        running = worker.run();
        await expect.poll(() => failures).toEqual(['first', 'second']);
        await worker.pause();
        expect(errors).toEqual([]);
        for (const id of ['first', 'second']) {
          expect(await queue.getJobState(id)).toBe(
            retained.includes(id) ? 'failed' : 'unknown',
          );
          if (retained.includes(id))
            expect(await backend.getJobData(id)).toMatchObject({
              failedReason: 'business failure',
              attemptsMade: 1,
              attemptsStarted: 1,
            });
          else {
            expect(await queue.getJob(id)).toBeUndefined();
            await queue.add(
              'replacement',
              { replacement: true },
              { jobId: id },
            );
            expect((await queue.getJob(id))?.data).toEqual({
              replacement: true,
            });
            expect(await queue.getJobState(id)).toBe('waiting');
          }
        }
        expect(await backend.getJobData('completed')).toEqual(snapshot);
      } finally {
        await worker.close(true);
        await running;
        await queue.close();
      }
    },
  );
});
