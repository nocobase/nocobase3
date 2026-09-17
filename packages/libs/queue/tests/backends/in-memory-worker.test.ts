import { Queue, Worker } from 'bullmq';
import type { IQueueBackend } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';

function fixture() {
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
  const backend = factory(
    'jobs',
    { connection: {} },
    { withBlockingConnection: true },
  );
  return { queue, backend };
}

describe('memory worker backend claim and wake protocol', () => {
  it('preserves active state on invalid delayed moves and supports skipAttempt plus fetchNext', async () => {
    const { queue, backend } = fixture();
    try {
      const first = await queue.add('first', {}, { jobId: 'first-id' });
      const second = await queue.add('second', {});
      await backend.moveToActive('owner');
      await expect(
        backend.moveToDelayed(first.id!, Date.now(), 100, 'wrong'),
      ).rejects.toThrow(/token/u);
      await expect(
        backend.moveToDelayed(first.id!, Date.now(), NaN, 'owner'),
      ).rejects.toThrow();
      await expect(
        backend.moveToDelayed(first.id!, Date.now(), 100, 'owner', {
          fieldsToUpdate: { unsupported: true },
        }),
      ).rejects.toThrow();
      expect(await queue.getJobState(first.id!)).toBe('active');
      const result = await backend.moveToDelayed(
        first.id!,
        Date.now(),
        1000,
        'owner',
        { skipAttempt: true, fetchNext: true },
      );
      expect(result).toBeDefined();
      if (!result) throw new Error('Expected next job tuple');
      expect(result[1]).toBe(second.id);
      expect(await queue.getJobState(first.id!)).toBe('delayed');
      expect((await queue.getJob(first.id!))?.attemptsMade).toBe(0);
      expect(await queue.getJobState(second.id!)).toBe('active');
      await queue.drain(true);
      const reused = await queue.add('reused', {}, { jobId: first.id });
      expect(await queue.getJobState(reused.id!)).toBe('waiting');
    } finally {
      await Promise.all([queue.close(), backend.close()]);
    }
  });
  it('keeps delayed jobs unavailable until due and wakes a blocked Worker', async () => {
    const factory = createInMemoryBackendFactory();
    const queue = new Queue('delayed', { connection: {} }, factory);
    const times: number[] = [];
    const worker = new Worker(
      'delayed',
      async () => {
        times.push(Date.now());
      },
      { connection: {}, autorun: false },
      factory,
    );
    worker.on('error', () => {});
    let running: Promise<void> | undefined;
    try {
      const job = await queue.add('event', {}, { delay: 150 });
      expect(await queue.getJobState(job.id!)).toBe('delayed');
      running = worker.run();
      await expect.poll(() => queue.getJobState(job.id!)).toBe('completed');
      expect(times).toHaveLength(1);
      expect(times[0]! - job.timestamp).toBeGreaterThanOrEqual(150);
    } finally {
      await worker.close(true);
      await running;
      await queue.close();
    }
  });
  it.each([false, true])(
    'places an immediate retry at the expected end (lifo: %s)',
    async (lifo) => {
      const { queue, backend } = fixture();
      try {
        const first = await queue.add('first', {});
        const second = await queue.add('second', {});
        await backend.moveToActive('owner');
        await expect(
          backend.retryJob(first.id!, lifo, 'wrong'),
        ).rejects.toThrow(/token/u);
        expect(await queue.getJobState(first.id!)).toBe('active');
        await expect(
          backend.retryJob(first.id!, lifo, 'owner', {
            fieldsToUpdate: { unsupported: true },
          }),
        ).rejects.toThrow();
        expect((await queue.getJob(first.id!))?.attemptsMade).toBe(0);
        await backend.retryJob(first.id!, lifo, 'owner', {
          fieldsToUpdate: {
            failedReason: 'temporary',
            stacktrace: '["temporary"]',
          },
        });
        const stored = await queue.getJob(first.id!);
        expect(stored?.attemptsMade).toBe(1);
        expect(stored?.failedReason).toBe('temporary');
        expect(stored?.stacktrace).toEqual(['temporary']);
        expect((await backend.moveToActive('next'))[1]).toBe(
          lifo ? first.id : second.id,
        );
      } finally {
        await Promise.all([queue.close(), backend.close()]);
      }
    },
  );
  it.each([0, 100])(
    'retries with backoff %i and completes once on the second attempt',
    async (delay) => {
      const factory = createInMemoryBackendFactory();
      const queue = new Queue('retry', { connection: {} }, factory);
      let calls = 0;
      const started: number[] = [];
      const worker = new Worker(
        'retry',
        async () => {
          started.push(Date.now());
          if (++calls === 1) throw new Error('temporary');
          return 'ok';
        },
        { connection: {}, autorun: false },
        factory,
      );
      worker.on('error', () => {});
      let running: Promise<void> | undefined;
      try {
        const job = await queue.add(
          'event',
          {},
          { attempts: 2, backoff: delay },
        );
        running = worker.run();
        await expect.poll(() => queue.getJobState(job.id!)).toBe('completed');
        expect(calls).toBe(2);
        expect(started[1]! - started[0]!).toBeGreaterThanOrEqual(delay);
        const stored = await queue.getJob(job.id!);
        expect(stored?.attemptsMade).toBe(2);
        expect(stored?.attemptsStarted).toBe(2);
      } finally {
        await worker.close(true);
        await running;
        await queue.close();
      }
    },
  );
  it('claims unprioritized jobs first, then ascending priority with FIFO ties', async () => {
    const { queue, backend } = fixture();
    try {
      const jobs = await queue.addBulk([
        { name: 'p2-first', data: {}, opts: { priority: 2 } },
        { name: 'p1', data: {}, opts: { priority: 1 } },
        { name: 'plain', data: {} },
        { name: 'p2-last', data: {}, opts: { priority: 2 } },
      ]);
      const ids: (string | null)[] = [];
      for (let i = 0; i < jobs.length; i++)
        ids.push((await backend.moveToActive(`token-${i}`))[1]);
      expect(ids).toEqual([jobs[2]?.id, jobs[1]?.id, jobs[0]?.id, jobs[3]?.id]);
    } finally {
      await Promise.all([queue.close(), backend.close()]);
    }
  });
  it('claims each waiting job only once under concurrent calls', async () => {
    const { queue, backend } = fixture();
    try {
      await queue.add('event', { value: 1 });
      const claims: unknown[][] = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          backend.moveToActive(`token-${index}`),
        ),
      );
      expect(claims.filter(([job]) => job !== null)).toHaveLength(1);
      expect(claims.filter(([job]) => job === null)).toHaveLength(7);
    } finally {
      await Promise.allSettled([queue.close(), backend.close()]);
    }
  });

  it('wakes an existing wait when another backend enqueues', async () => {
    const { queue, backend } = fixture();
    try {
      const waiting = backend.waitForJob(0.2);
      await queue.add('event', {});
      expect(await waiting).not.toBeNull();
    } finally {
      await Promise.allSettled([queue.close(), backend.close()]);
    }
  });

  it('interrupts pending waits on disconnect and permits reconnect', async () => {
    const { queue, backend } = fixture();
    try {
      const waiting = backend.waitForJob(60);
      void waiting.catch(() => {});
      await backend.disconnectBlocking();
      expect(await waiting).toBeNull();
      expect(await backend.waitForJob(60)).toBeNull();
      await backend.reconnectBlocking();
      await queue.add('event', {});
      expect(await backend.waitForJob(0.01)).not.toBeNull();
    } finally {
      await Promise.allSettled([queue.close(), backend.close()]);
    }
  });

  it('returns failed lock IDs and checks the exact token', async () => {
    const { queue, backend } = fixture();
    try {
      const job = await queue.add('event', {});
      await backend.moveToActive('owner');
      expect(await backend.extendLocks([job.id!], ['wrong'], 100)).toEqual([
        job.id,
      ]);
      expect(await backend.extendLocks([job.id!], ['owner'], 100)).toEqual([]);
      await expect(
        backend.moveJobFromActiveToWait(job.id!, 'wrong'),
      ).rejects.toThrow(/lock|token/u);
      await backend.moveJobFromActiveToWait(job.id!, 'owner');
      expect(await queue.getJobState(job.id!)).toBe('waiting');
    } finally {
      await Promise.allSettled([queue.close(), backend.close()]);
    }
  });
  it('uses the Worker-configured lock duration and expires ownership', async () => {
    const factory = createInMemoryBackendFactory();
    const options = { connection: {}, lockDuration: 5 };
    const backend = factory('jobs', options, { withBlockingConnection: true });
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
      await backend.moveToActive('owner');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(await backend.extendLocks([job.id!], ['owner'], 100)).toEqual([
        job.id,
      ]);
    } finally {
      await Promise.allSettled([queue.close(), backend.close()]);
    }
  });
  it('runs a real Worker concurrently, pauses locally and closes without leftover work', async () => {
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
    let active = 0;
    let maximum = 0;
    const completed = new Set<string>();
    const errors: Error[] = [];
    const worker = new Worker<unknown, unknown, string, IQueueBackend>(
      'jobs',
      async (job) => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active--;
        return job.id;
      },
      {
        connection: {},
        concurrency: 2,
        autorun: false,
      },
      factory,
    );
    worker.on('error', (error) => {
      errors.push(error);
    });
    worker.on('completed', (job) => {
      completed.add(job.id!);
    });
    try {
      await queue.add('event', {});
      await queue.add('event', {});
      await queue.add('event', {});
      const run = worker.run();
      void run.catch((error: unknown) => {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      });
      await expect.poll(() => completed.size).toBe(3);
      await worker.pause();
      await queue.add('paused', {});
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(completed.size).toBe(3);
      worker.resume();
      await expect.poll(() => completed.size).toBe(4);
      expect(maximum).toBe(2);
      expect(errors).toEqual([]);
      await worker.close();
      await run;
      expect(active).toBe(0);
    } finally {
      await Promise.allSettled([worker.close(true), queue.close()]);
    }
  });
  it('renews locks for a long-running real processor without stalled duplication', async () => {
    const factory = createInMemoryBackendFactory();
    const queue = new Queue<
      unknown,
      unknown,
      string,
      unknown,
      unknown,
      string,
      IQueueBackend
    >('long', { connection: {} }, factory);
    let calls = 0;
    const errors: Error[] = [];
    const stalled: string[] = [];
    const worker = new Worker<unknown, unknown, string, IQueueBackend>(
      'long',
      async () => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      },
      {
        connection: {},
        lockDuration: 200,
        lockRenewTime: 40,
        stalledInterval: 50,
      },
      factory,
    );
    worker.on('error', (error) => {
      errors.push(error);
    });
    worker.on('stalled', (id) => {
      stalled.push(id);
    });
    try {
      const job = await queue.add('event', {});
      await expect
        .poll(() => queue.getJobState(job.id!), { timeout: 3000 })
        .toBe('completed');
      expect(calls).toBe(1);
      expect(stalled).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await Promise.allSettled([worker.close(), queue.close()]);
    }
  });
  it('fails recovered jobs past the stalled limit without calling the business processor', async () => {
    const factory = createInMemoryBackendFactory();
    const queue = new Queue<
      unknown,
      unknown,
      string,
      unknown,
      unknown,
      string,
      IQueueBackend
    >('recovered', { connection: {} }, factory);
    const abandoned = factory('recovered', {
      connection: {},
      ...{ lockDuration: 5, stalledInterval: 5, maxStalledCount: 0 },
    });
    let worker: Worker<unknown, unknown, string, IQueueBackend> | undefined;
    let calls = 0;
    try {
      const job = await queue.add('event', {});
      await abandoned.moveToActive('lost');
      await abandoned.moveStalledJobsToWait();
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(await abandoned.moveStalledJobsToWait()).toEqual([job.id]);
      worker = new Worker<unknown, unknown, string, IQueueBackend>(
        'recovered',
        async () => {
          calls++;
        },
        { connection: {} },
        factory,
      );
      worker.on('error', () => {});
      await expect.poll(() => queue.getJobState(job.id!)).toBe('failed');
      expect(calls).toBe(0);
      expect((await queue.getJob(job.id!))?.failedReason).toBe(
        'job stalled more than allowable limit',
      );
    } finally {
      await Promise.allSettled([
        worker?.close(),
        queue.close(),
        abandoned.close(),
      ]);
    }
  });
});
