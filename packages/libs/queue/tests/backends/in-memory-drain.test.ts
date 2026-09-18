import { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';
import { createQueueIdentity } from '../../src/identity.js';
import { createQueueService } from '../../src/service.js';

describe('memory public-manager drain partitions', () => {
  it.each([false, true])(
    'drains six categories with delayed=%s and permits clean ID reuse',
    async (delayed) => {
      const factory = createInMemoryBackendFactory();
      const identity = createQueueIdentity('drain-partitions', 'jobs');
      const service = createQueueService({
        namespace: identity.namespace,
        queueBackend: 'memory-probe',
      });
      // A registered real memory factory allows independent public BullMQ readback.
      service.registerBackend('memory-probe', factory);
      const queue = new Queue(
        identity.redisQueueName,
        { connection: {}, prefix: identity.redisPrefix },
        factory,
      );
      const backend = queue.getBackend();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(100000);
      try {
        const completed = await queue.add(
          'completed',
          {},
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
        const failed = await queue.add('failed', {}, { jobId: 'failed' });
        await backend.moveToActive('failed-owner');
        await backend.moveToFailed(
          failed,
          'failure',
          false,
          'failed-owner',
          false,
        );
        const active = await queue.add('active', {}, { jobId: 'active' });
        await backend.moveToActive('active-owner');
        await queue.add('delayed', {}, { jobId: 'delayed' });
        await backend.moveToActive('delayed-owner');
        // Use a retry transition to populate the separate due-time bookkeeping.
        await backend.moveToDelayed(
          'delayed',
          Date.now(),
          1000,
          'delayed-owner',
        );
        await queue.add('waiting', {}, { jobId: 'waiting' });
        await queue.add(
          'prioritized',
          {},
          { jobId: 'prioritized', priority: 1 },
        );
        const categories = [
          'wait',
          'prioritized',
          'delayed',
          'active',
          'completed',
          'failed',
        ] as const;
        expect(await backend.getCounts([...categories])).toEqual([
          1, 1, 1, 1, 1, 1,
        ]);
        const kept = [
          'active',
          'completed',
          'failed',
          ...(delayed ? [] : ['delayed']),
        ];
        const snapshots = await Promise.all(
          kept.map((id) => backend.getJobData(id)),
        );
        await service.setup();
        const manager = service.manager('jobs');
        if (delayed) await manager.drain({ delayed: true });
        else await manager.drain();
        expect(await backend.getCounts([...categories])).toEqual([
          0,
          0,
          delayed ? 0 : 1,
          1,
          1,
          1,
        ]);
        expect(
          await Promise.all(kept.map((id) => backend.getJobData(id))),
        ).toEqual(snapshots);
        const removed = [
          'waiting',
          'prioritized',
          ...(delayed ? ['delayed'] : []),
        ];
        for (const id of removed) {
          expect(await queue.getJob(id)).toBeUndefined();
          expect(await queue.getJobState(id)).toBe('unknown');
          expect(
            await backend.extendLocks([id], ['delayed-owner'], 30000),
          ).toEqual([id]);
          await queue.add(
            'replacement',
            { replacement: id },
            { jobId: id, delay: 5000 },
          );
          expect((await queue.getJob(id))?.data).toEqual({ replacement: id });
          expect((await queue.getJob(id))?.attemptsMade).toBe(0);
        }
        clock.mockReturnValue(101000);
        if (!delayed) {
          expect((await backend.moveToActive('due-owner'))[1]).toBe('delayed');
          await backend.moveToFailed(
            (await queue.getJob('delayed'))!,
            'due',
            false,
            'due-owner',
            false,
          );
        }
        const empty = await backend.moveToActive('too-early');
        expect(empty[1]).toBeNull();
        expect(empty[3]).toBe(105000);
        for (const id of removed)
          expect(await queue.getJobState(id)).toBe('delayed');
        expect(
          await backend.extendLocks(['active'], ['active-owner'], 30000),
        ).toEqual([]);
        await backend.moveToCompleted(
          active,
          'still owned',
          false,
          'active-owner',
          false,
        );
        clock.mockReturnValue(105000);
        for (const id of removed) {
          expect((await backend.moveToActive('replacement-owner'))[1]).toBe(id);
          expect(
            await backend.extendLocks([id], ['replacement-owner'], 30000),
          ).toEqual([]);
        }
        expect((await backend.moveToActive('none'))[1]).toBeNull();
      } finally {
        clock.mockRestore();
        await service.shutdown();
        await queue.close();
      }
    },
  );
});
