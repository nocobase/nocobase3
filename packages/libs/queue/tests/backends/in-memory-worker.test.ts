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
