import { expect, it, vi } from 'vitest';
import { createQueueService } from '../src/service.js';
import { createInMemoryBackendFactory } from '../src/backends/in-memory/index.js';

function barrier() {
  let release = (): void => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function errors(error: unknown): unknown[] {
  return error instanceof AggregateError
    ? [error, ...error.errors.flatMap(errors)]
    : [error];
}

it.each(['construction', 'readiness'] as const)(
  'bounds ordinary setup %s failure cleanup and shares it with shutdown',
  async (failurePoint) => {
    const factory = createInMemoryBackendFactory();
    const closing = barrier();
    const releaseClose = barrier();
    const primary = new Error('later queue initialization failed');
    let created = 0;
    let closeCalls = 0;
    const service = createQueueService({
      namespace: 'ordinary-setup-failure',
      queueBackend: 'test',
      setupTimeoutMs: 20,
      shutdownTimeoutMs: 20,
    });
    service.registerBackend('test', (...args) => {
      const later = created++ > 0;
      if (later && failurePoint === 'construction') throw primary;
      const backend = factory(...args);
      if (later)
        backend.waitUntilReady = async () => {
          throw primary;
        };
      const close = backend.close.bind(backend);
      backend.close = async (...values) => {
        closeCalls++;
        closing.release();
        await releaseClose.promise;
        await close(...values);
      };
      return backend;
    });
    service.producer('first');
    service.producer('second');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let failure: unknown;
    let finished = false;
    const starting = service.setup().catch((error: unknown) => {
      failure = error;
      finished = true;
    });
    let stopping: Promise<void> | undefined;
    let stopped = false;
    try {
      await closing.promise;
      await vi.advanceTimersByTimeAsync(1000);
      stopping = service
        .shutdown()
        .catch(() => {})
        .finally(() => {
          stopped = true;
        });
      await vi.advanceTimersByTimeAsync(4021);
      expect(finished).toBe(true);
      expect(stopped).toBe(true);
      expect(errors(failure)).toContain(primary);
      expect(
        errors(failure).some(
          (error) =>
            error instanceof Error &&
            /cleanup.*(deadline|unresolved)/i.test(error.message),
        ),
      ).toBe(true);
      expect(closeCalls).toBe(failurePoint === 'construction' ? 1 : 2);
    } finally {
      releaseClose.release();
      await vi.runAllTimersAsync();
      await starting;
      await stopping;
      await service.shutdown().catch(() => {});
      vi.useRealTimers();
    }
  },
);

it('reconciles a handler registered on an earlier queue while setup awaits another queue', async () => {
  const factory = createInMemoryBackendFactory();
  const waiting = barrier();
  const readiness = barrier();
  const workerWaiting = barrier();
  const workerReadiness = barrier();
  const invoked = barrier();
  let queues = 0;
  let workers = 0;
  let ready = false;
  const service = createQueueService({
    namespace: 'setup-registration',
    queueBackend: 'test',
  });
  service.registerBackend('test', (name, options, metadata) => {
    const backend = factory(name, options, metadata);
    if (metadata?.withBlockingConnection) {
      workers++;
      backend.waitUntilReady = async () => {
        workerWaiting.release();
        await workerReadiness.promise;
      };
    } else if (++queues === 2) {
      backend.waitUntilReady = async () => {
        waiting.release();
        await readiness.promise;
      };
    }
    return backend;
  });
  const first = service.producer('first');
  service.producer('second');
  const starting = service.setup().then(() => {
    ready = true;
  });
  try {
    await waiting.promise;
    service.consumer('first').consume(async () => {
      invoked.release();
    });
    readiness.release();
    // The turn boundary observes either successful setup or construction of its required Worker.
    await Promise.race([starting, workerWaiting.promise]);
    expect(workers).toBe(1);
    expect(ready).toBe(false);
    workerReadiness.release();
    await starting;
    await first.publish('event', {});
    await invoked.promise;
    expect(workers).toBe(1);
  } finally {
    readiness.release();
    workerReadiness.release();
    await starting;
    await service.shutdown();
  }
});

it.each([
  { transition: 'completed', resumed: false },
  { transition: 'failed', resumed: false },
  { transition: 'waiting', resumed: false },
  { transition: 'completed', resumed: true },
] as const)(
  'closes the real Worker transport when its $transition transition is blocked (resumed: $resumed)',
  async ({ transition, resumed }) => {
    const { Worker } = await import('bullmq');
    const run = vi.spyOn(Worker.prototype, 'run');
    const factory = createInMemoryBackendFactory();
    const entered = barrier();
    const releaseTransition = barrier();
    const claimed = barrier();
    const releaseClaim = barrier();
    let workerClosed = false;
    let forceClosed = false;
    let disconnectBlocking: (() => Promise<void>) | undefined;
    let handlerCalls = 0;
    const service = createQueueService({
      namespace: `finalization-${transition}`,
      queueBackend: 'test',
      shutdownTimeoutMs: 20,
      cancellationGraceMs: 20,
    });
    service.registerBackend('test', (name, options, metadata) => {
      const backend = factory(name, options, metadata);
      if (metadata?.withBlockingConnection) {
        disconnectBlocking = () => backend.disconnectBlocking(true);
        // All three public backend transitions have distinct signatures; wrap each without an incomplete backend cast.
        if (transition === 'completed') {
          const original = backend.moveToCompleted.bind(backend);
          backend.moveToCompleted = async (...args) => {
            entered.release();
            await releaseTransition.promise;
            return original(...args);
          };
        } else if (transition === 'failed') {
          const original = backend.moveToFailed.bind(backend);
          backend.moveToFailed = async (...args) => {
            entered.release();
            await releaseTransition.promise;
            return original(...args);
          };
        } else {
          const original = backend.moveJobFromActiveToWait.bind(backend);
          backend.moveJobFromActiveToWait = async (...args) => {
            entered.release();
            await releaseTransition.promise;
            return original(...args);
          };
          const active = backend.moveToActive.bind(backend);
          backend.moveToActive = async (...args) => {
            const result = await active(...args);
            if (result[1]) {
              claimed.release();
              await releaseClaim.promise;
            }
            return result;
          };
        }
        const close = backend.close.bind(backend);
        backend.close = async (...args) => {
          workerClosed = true;
          forceClosed = args[0] === true;
          releaseTransition.release();
          await close(...args);
        };
      }
      return backend;
    });
    const handler = async (): Promise<void> => {
      handlerCalls++;
      if (transition === 'failed') throw new Error('business failure');
    };
    const off = service.consumer('jobs').consume(handler);
    await service.setup();
    if (resumed) {
      await off();
      await disconnectBlocking?.();
      await run.mock.results[0]?.value;
      service.consumer('jobs').consume(handler);
    }
    await service.producer('jobs').publish('event', {});
    if (transition === 'waiting') {
      await claimed.promise;
      await off();
      releaseClaim.release();
    }
    await entered.promise;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let finished = false;
    const stopping = service
      .shutdown()
      .catch(() => {})
      .finally(() => {
        finished = true;
      });
    try {
      await vi.advanceTimersByTimeAsync(19);
      expect(workerClosed).toBe(false);
      await vi.advanceTimersByTimeAsync(22);
      expect(finished).toBe(true);
      expect(workerClosed).toBe(true);
      expect(forceClosed).toBe(true);
      expect(handlerCalls).toBe(transition === 'waiting' ? 0 : 1);
    } finally {
      releaseClaim.release();
      releaseTransition.release();
      await vi.advanceTimersByTimeAsync(0);
      await stopping;
      run.mockRestore();
      vi.useRealTimers();
    }
  },
);
