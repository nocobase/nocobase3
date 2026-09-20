import { expect, it, vi } from 'vitest';
import { createQueueService } from '../src/service.js';
import { createInMemoryBackendFactory } from '../src/backends/in-memory/index.js';

it.each(['resolve', 'reject'] as const)(
  'keeps a timed-out publication tracked until its late %s',
  async (outcome) => {
    const memory = createInMemoryBackendFactory();
    const warn = vi.fn();
    const error = vi.fn();
    const service = createQueueService(
      {
        namespace: `late-publication-${outcome}`,
        queueBackend: 'probe',
        shutdownTimeoutMs: 0,
        cancellationGraceMs: 0,
      },
      { logger: { warn, error } },
    );
    let release = (): void => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    service.registerBackend('probe', (...args) => {
      const backend = memory(...args);
      backend.addJob = async () => {
        entered = true;
        await barrier;
        if (outcome === 'reject') throw new Error('late publication failure');
        return 'late-id';
      };
      return backend;
    });
    const producer = service.producer('jobs');
    await service.setup();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let publicationFailure: unknown;
    let shutdownFailure: unknown;
    try {
      const publication = producer
        .publish('event', {})
        .catch((reason: unknown) => {
          publicationFailure = reason;
        });
      await vi.advanceTimersByTimeAsync(0);
      expect(entered).toBe(true);
      await vi.advanceTimersByTimeAsync(10001);
      expect(publicationFailure).toBeInstanceOf(Error);
      const closing = service.shutdown().catch((reason: unknown) => {
        shutdownFailure = reason;
      });
      await vi.advanceTimersByTimeAsync(5001);
      expect(shutdownFailure).toBeInstanceOf(AggregateError);
      expect(error).toHaveBeenCalledWith(
        expect.any(Object),
        'Queue shutdown has unresolved publications',
      );
      expect(warn).not.toHaveBeenCalled();
      release();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.all([publication, closing]);
      expect(warn).toHaveBeenCalledWith(
        {},
        'Previously unresolved queue publications have settled',
      );
    } finally {
      release();
      await vi.runAllTimersAsync();
      await service.shutdown().catch(() => {});
      vi.useRealTimers();
    }
  },
);
