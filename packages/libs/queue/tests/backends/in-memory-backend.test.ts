import { Queue } from 'bullmq';
import type { IQueueBackend } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';

describe('memory backend storage integration', () => {
  it('gives each Queue its own backend while sharing jobs within one factory', async () => {
    const factory = createInMemoryBackendFactory();
    const a = new Queue<
      unknown,
      unknown,
      string,
      unknown,
      unknown,
      string,
      IQueueBackend
    >('jobs', { connection: {} }, factory);
    const b = new Queue<
      unknown,
      unknown,
      string,
      unknown,
      unknown,
      string,
      IQueueBackend
    >('jobs', { connection: {} }, factory);
    const other = new Queue<
      unknown,
      unknown,
      string,
      unknown,
      unknown,
      string,
      IQueueBackend
    >('jobs', { connection: {} }, createInMemoryBackendFactory());
    try {
      await Promise.all([
        a.waitUntilReady(),
        b.waitUntilReady(),
        other.waitUntilReady(),
      ]);
      expect(a.getBackend()).not.toBe(b.getBackend());
      const job = await a.add('event', { nested: { value: 1 } });
      expect((await b.getJob(job.id!))?.data).toEqual({ nested: { value: 1 } });
      expect(await other.getJob(job.id!)).toBeUndefined();
      expect(await b.getJobCounts('waiting')).toEqual({ waiting: 1 });
      await a.close();
      expect(await b.getJobState(job.id!)).toBe('waiting');
    } finally {
      await Promise.allSettled([a.close(), b.close(), other.close()]);
    }
  });
});
