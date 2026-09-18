import { Queue, Worker } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';
import { backoff } from '../../src/config-validation.js';

const horizon = 2 ** 41 - 1;

function barrier(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('memory actual retry scheduling boundary', () => {
  it.each([
    { timestamp: horizon - 99, delay: 100 },
    { timestamp: horizon + 1, delay: 0 },
    { timestamp: 100000, delay: 0.5 },
    { timestamp: 100000.5, delay: 1 },
    { timestamp: -1, delay: 1 },
    { timestamp: 100000, delay: Number.MAX_SAFE_INTEGER },
  ])(
    'rejects timestamp=$timestamp delay=$delay before mutating active state',
    async ({ timestamp, delay }) => {
      const factory = createInMemoryBackendFactory();
      const queue = new Queue('retry-boundary', { connection: {} }, factory);
      const backend = queue.getBackend();
      try {
        await queue.add('job', {}, { jobId: 'job' });
        await backend.moveToActive('owner');
        const before = await backend.getJobData('job');
        await expect(
          backend.moveToDelayed('job', timestamp, delay, 'owner', {
            fieldsToUpdate: {
              failedReason: 'must not persist',
              stacktrace: '[]',
            },
          }),
        ).rejects.toThrow(/timestamp|horizon/u);
        expect(await backend.getJobData('job')).toEqual(before);
        expect(
          await backend.getCounts(['active', 'delayed', 'wait', 'failed']),
        ).toEqual([1, 0, 0, 0]);
        expect(await backend.extendLocks(['job'], ['owner'], 30000)).toEqual(
          [],
        );
        expect((await backend.moveToActive('other'))[3]).toBe(0);
      } finally {
        await queue.close();
      }
    },
  );

  it('accepts the exact horizon and claims the retry only when it is due', async () => {
    const factory = createInMemoryBackendFactory();
    const queue = new Queue('exact-horizon', { connection: {} }, factory);
    const backend = queue.getBackend();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(horizon - 100);
    try {
      await queue.add('job', {}, { jobId: 'job' });
      await backend.moveToActive('owner');
      await backend.moveToDelayed('job', Date.now(), 100, 'owner');
      clock.mockReturnValue(horizon - 1);
      expect(await backend.moveToActive('early')).toEqual([
        null,
        null,
        0,
        horizon,
      ]);
      expect(await queue.getJobState('job')).toBe('delayed');
      clock.mockReturnValue(horizon);
      expect((await backend.moveToActive('due'))[1]).toBe('job');
      expect(await backend.getJobData('job')).toMatchObject({
        attemptsMade: 1,
        attemptsStarted: 2,
        delay: 0,
      });
      expect(await backend.extendLocks(['job'], ['owner'], 30000)).toEqual([
        'job',
      ]);
      expect(await backend.extendLocks(['job'], ['due'], 30000)).toEqual([]);
    } finally {
      clock.mockRestore();
      await queue.close();
    }
  });

  it.each([horizon - 99, horizon + 1])(
    'reports a real Worker retry error after a held handler advances to %i',
    async (finishedAt) => {
      const factory = createInMemoryBackendFactory();
      const queue = new Queue('worker-horizon', { connection: {} }, factory);
      const backend = queue.getBackend();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(horizon - 2000);
      const entered = barrier();
      const release = barrier();
      const errors: Error[] = [];
      const tokens: string[] = [];
      let calls = 0;
      const worker = new Worker(
        'worker-horizon',
        async (_job, token) => {
          calls++;
          if (token) tokens.push(token);
          entered.resolve();
          await release.promise;
          throw new Error('business failure after long work');
        },
        { connection: {}, autorun: false },
        factory,
      );
      worker.on('error', (error) => {
        errors.push(error);
      });
      let running: Promise<void> | undefined;
      try {
        // The configured delay fits at publication; only the actual retry is out of range.
        expect(backoff(100, 2, Date.now())).toBe(100);
        await queue.add('job', {}, { jobId: 'job', attempts: 2, backoff: 100 });
        running = worker.run();
        await entered.promise;
        const before = await backend.getJobData('job');
        clock.mockReturnValue(finishedAt);
        release.resolve();
        await expect
          .poll(() => errors.map((error) => error.message), { timeout: 1000 })
          .toEqual([expect.stringMatching(/scheduling horizon/u)]);
        await worker.pause();
        expect(calls).toBe(1);
        expect(await backend.getJobData('job')).toEqual(before);
        expect(
          await backend.getCounts(['active', 'delayed', 'wait', 'failed']),
        ).toEqual([1, 0, 0, 0]);
        expect(await backend.extendLocks(['job'], tokens, 30000)).toEqual([]);
        expect((await backend.moveToActive('other'))[3]).toBe(0);
      } finally {
        release.resolve();
        await worker.close(true);
        await running;
        clock.mockRestore();
        await queue.close();
      }
    },
  );
});

describe('real memory Worker attempt counts and exponential timing', () => {
  it.each([0, 1])(
    'attempts=%i executes exactly once despite configured backoff',
    async (attempts) => {
      const factory = createInMemoryBackendFactory();
      const queue = new Queue('once', { connection: {} }, factory);
      const starts: number[] = [];
      const errors: Error[] = [];
      const worker = new Worker(
        'once',
        async () => {
          starts.push(Date.now());
          throw new Error('terminal business failure');
        },
        { connection: {}, autorun: false },
        factory,
      );
      worker.on('error', (error) => {
        errors.push(error);
      });
      let running: Promise<void> | undefined;
      try {
        await queue.add(
          'job',
          {},
          {
            jobId: 'job',
            attempts,
            backoff: { type: 'exponential', delay: 50 },
          },
        );
        running = worker.run();
        await expect.poll(() => queue.getJobState('job')).toBe('failed');
        await new Promise((resolve) => setTimeout(resolve, 120));
        expect(starts).toHaveLength(1);
        expect(await queue.getJobState('job')).toBe('failed');
        expect(await queue.getBackend().getJobData('job')).toMatchObject({
          attemptsMade: 1,
          attemptsStarted: 1,
          failedReason: 'terminal business failure',
        });
        expect(errors).toEqual([]);
      } finally {
        await worker.close(true);
        await running;
        await queue.close();
      }
    },
  );

  it('observes three starts separated by the first and doubled exponential delays', async () => {
    const factory = createInMemoryBackendFactory();
    const queue = new Queue('exponential', { connection: {} }, factory);
    const starts: number[] = [];
    const failures: number[] = [];
    const errors: Error[] = [];
    const delay = 80;
    const worker = new Worker(
      'exponential',
      async () => {
        starts.push(Date.now());
        if (starts.length < 3) throw new Error('temporary');
        return 'done';
      },
      { connection: {}, autorun: false },
      factory,
    );
    worker.on('error', (error) => {
      errors.push(error);
    });
    worker.on('failed', () => {
      failures.push(Date.now());
    });
    let running: Promise<void> | undefined;
    try {
      await queue.add(
        'job',
        {},
        { jobId: 'job', attempts: 3, backoff: { type: 'exponential', delay } },
      );
      running = worker.run();
      await expect
        .poll(() => queue.getJobState('job'), { timeout: 3000 })
        .toBe('completed');
      expect(starts).toHaveLength(3);
      expect(failures).toHaveLength(2);
      expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(delay);
      expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(delay * 2);
      expect(await queue.getBackend().getJobData('job')).toMatchObject({
        attemptsMade: 3,
        attemptsStarted: 3,
        returnvalue: '"done"',
      });
      expect(errors).toEqual([]);
    } finally {
      await worker.close(true);
      await running;
      await queue.close();
    }
  });
});
