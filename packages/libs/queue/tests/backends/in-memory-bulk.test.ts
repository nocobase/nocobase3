import { Queue } from 'bullmq';
import type { IQueueBackend } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';

function queue() {
  return new Queue<
    unknown,
    unknown,
    string,
    unknown,
    unknown,
    string,
    IQueueBackend
  >('jobs', { connection: {} }, createInMemoryBackendFactory());
}

describe('memory bulk commit', () => {
  it('commits a prepared batch and retains the first occurrence of duplicate IDs', async () => {
    const q = queue();
    try {
      await q.add('existing', { value: 0 }, { jobId: 'existing' });
      const jobs = await q.addBulk([
        { name: 'first', data: 1, opts: { jobId: 'same' } },
        { name: 'second', data: 2, opts: { jobId: 'same' } },
        { name: 'overwrite', data: 3, opts: { jobId: 'existing' } },
        { name: 'unique', data: 4 },
      ]);
      expect(jobs.map((job) => job.id).slice(0, 3)).toEqual([
        'same',
        'same',
        'existing',
      ]);
      expect((await q.getJob('same'))?.data).toBe(1);
      expect((await q.getJob('existing'))?.data).toEqual({ value: 0 });
      expect(await q.getJobCounts('waiting')).toEqual({ waiting: 3 });
    } finally {
      await q.close();
    }
  });

  it('rejects a later malformed or unsupported entry before any writes', async () => {
    const q = queue();
    try {
      const sample = await q.add('sample', {});
      const base = await q.getBackend().getJobData(sample.id!);
      if (!base) throw new Error('Missing fixture');
      for (const invalid of [
        { ...base, data: '{broken' },
        { ...base, opts: { deduplication: { id: 'd' } } },
      ]) {
        await expect(
          q.getBackend().addJobs([
            { job: base, jobId: 'valid' },
            { job: invalid, jobId: 'invalid' },
          ]),
        ).rejects.toThrow();
        expect(await q.getJob('valid')).toBeUndefined();
        expect(await q.getJob('invalid')).toBeUndefined();
      }
    } finally {
      await q.close();
    }
  });
});
