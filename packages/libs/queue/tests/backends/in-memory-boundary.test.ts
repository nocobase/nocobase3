import { Queue } from 'bullmq';
import type { IQueueBackend } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';

const unsupported = [
  'forQueue',
  'parseNodeKey',
  'addFlow',
  'addJobScheduler',
  'moveToWaitingChildren',
  'retryFinishedJob',
  'promote',
  'retryFinishedJobs',
  'promoteJobs',
  'pause',
  'cleanJobsByState',
  'obliterate',
  'removeOrphanedJobs',
  'extendLock',
  'updateData',
  'updateProgress',
  'addLog',
  'clearLogs',
  'changeDelay',
  'changePriority',
  'remove',
  'removeUnprocessedChildren',
  'removeChildDependency',
  'removeDeduplicationKey',
  'deleteDeduplicationKey',
  'updateJobSchedulerNextMillis',
  'removeJobScheduler',
  'getJobScheduler',
  'isJobScheduler',
  'getJobSchedulerData',
  'getJobSchedulersRange',
  'getJobSchedulersCount',
  'isFinished',
  'isMaxed',
  'getDeduplicationJobId',
  'getJobLogs',
  'getRateLimitTtl',
  'getCountsPerPriority',
  'getDependencyCounts',
  'getDependencies',
  'getProcessedChildrenValues',
  'getIgnoredChildrenFailures',
  'getMetrics',
  'getClientList',
  'paginate',
  'getQueueMetaField',
  'getQueueMetaFields',
  'getQueueMeta',
  'hasQueueMetaField',
  'setRateLimit',
  'removeRateLimitKey',
  'removeDeprecatedPriorityKey',
  'trimEvents',
  'publishEvent',
  'readEvents',
] as const;

describe('memory backend unsupported boundary', () => {
  it.each(unsupported)(
    'rejects %s without modifying stored jobs',
    async (method) => {
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
      const backend = queue.getBackend();
      try {
        const job = await queue.add('event', { value: 1 });
        const before = await backend.getJobData(job.id!);
        await expect(
          Promise.resolve().then(() =>
            Reflect.apply(backend[method], backend, []),
          ),
        ).rejects.toThrow(`Unsupported in-memory queue operation: ${method}`);
        expect(await backend.getJobData(job.id!)).toEqual(before);
        expect(await backend.getState(job.id!)).toBe('waiting');
      } finally {
        await queue.close();
      }
    },
  );
  it.each([
    { repeat: { every: 1000 } },
    { parent: { id: 'p', queue: 'parent' } },
    { deduplication: { id: 'dedup' } },
  ])(
    'rejects unsupported enqueue metadata %j before writing',
    async (options) => {
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
        const plain = await queue.add('plain', {});
        const base = await queue.getBackend().getJobData(plain.id!);
        if (!base) throw new Error('Missing fixture job');
        await expect(
          queue.getBackend().addJob({ ...base, opts: options }, 'blocked', {}),
        ).rejects.toThrow(/Unsupported/u);
        expect(await queue.getBackend().getJobData('blocked')).toBeUndefined();
      } finally {
        await queue.close();
      }
    },
  );
});
