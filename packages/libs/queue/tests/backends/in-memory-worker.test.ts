import { Queue } from 'bullmq';
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
});
