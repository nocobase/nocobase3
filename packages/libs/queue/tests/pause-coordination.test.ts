import { Worker } from 'bullmq';
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

it.each(['registered', 'unregistered', 'shutdown'] as const)(
  'coordinates a draining pause before resume when subsequently %s',
  async (state) => {
    const gate = barrier();
    const entered = barrier();
    const memory = createInMemoryBackendFactory();
    const pause = vi.spyOn(Worker.prototype, 'pause');
    const resume = vi.spyOn(Worker.prototype, 'resume');
    const service = createQueueService({
      namespace: `pause-${state}`,
      queueBackend: 'probe',
    });
    service.registerBackend('probe', (name, options, metadata) => {
      const backend = memory(name, options, metadata);
      if (metadata?.withBlockingConnection) {
        const reconnect = backend.reconnectBlocking.bind(backend);
        backend.reconnectBlocking = async () => {
          entered.release();
          await gate.promise;
          await reconnect();
        };
      }
      return backend;
    });
    const off = service.consumer('jobs').consume(async () => {});
    await service.setup();
    const firstOff = off();
    let secondOff: Promise<void> | undefined;
    let closing: Promise<void> | undefined;
    try {
      expect(pause).toHaveBeenCalledWith(false);
      await entered.promise;
      const offAgain = service.consumer('jobs').consume(async () => {});
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(resume).not.toHaveBeenCalled();
      if (state === 'unregistered') secondOff = offAgain();
      if (state === 'shutdown') closing = service.shutdown();
      gate.release();
      await firstOff;
      await secondOff;
      await closing;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(resume).toHaveBeenCalledTimes(state === 'registered' ? 1 : 0);
    } finally {
      gate.release();
      await firstOff;
      await secondOff;
      await service.shutdown();
      pause.mockRestore();
      resume.mockRestore();
    }
  },
);

it('reports an unresolved original pause even when forced close resolves', async () => {
  const gate = barrier();
  const memory = createInMemoryBackendFactory();
  const warn = vi.fn();
  const error = vi.fn();
  const close = vi.spyOn(Worker.prototype, 'close');
  const service = createQueueService(
    {
      namespace: 'pending-pause',
      queueBackend: 'probe',
      shutdownTimeoutMs: 20,
      cancellationGraceMs: 20,
    },
    { logger: { warn, error } },
  );
  service.registerBackend('probe', (name, options, metadata) => {
    const backend = memory(name, options, metadata);
    if (metadata?.withBlockingConnection) {
      const disconnect = backend.disconnectBlocking.bind(backend);
      backend.disconnectBlocking = async (...args) => {
        await gate.promise;
        await disconnect(...args);
      };
    }
    return backend;
  });
  service.consumer('jobs').consume(async () => {});
  await service.setup();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  let failure: unknown;
  const closing = service.shutdown().catch((reason: unknown) => {
    failure = reason;
  });
  try {
    await vi.advanceTimersByTimeAsync(5041);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(true);
    expect(error).toHaveBeenCalledWith(
      expect.any(Object),
      'Queue shutdown has unresolved consumer pauses',
    );
    gate.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledWith(
      {},
      'Previously unresolved queue consumer pauses have settled; cleanup remains unconfirmed',
    );
    await expect(closing).resolves.toBeUndefined();
    expect(failure).toBeInstanceOf(AggregateError);
  } finally {
    gate.release();
    await vi.runAllTimersAsync();
    await closing;
    vi.useRealTimers();
    close.mockRestore();
  }
});

it('resumes after unregister and re-registration while Worker readiness is pending', async () => {
  const gate = barrier();
  const entered = barrier();
  const memory = createInMemoryBackendFactory();
  const service = createQueueService({
    namespace: 'setup-pause',
    queueBackend: 'probe',
  });
  service.registerBackend('probe', (name, options, metadata) => {
    const backend = memory(name, options, metadata);
    if (metadata?.withBlockingConnection) {
      backend.waitUntilReady = async () => {
        entered.release();
        await gate.promise;
      };
    }
    return backend;
  });
  const off = service.consumer('jobs').consume(async () => {});
  const starting = service.setup();
  await entered.promise;
  await off();
  const handler = vi.fn(async () => {});
  service.consumer('jobs').consume(handler);
  gate.release();
  try {
    await starting;
    await service.producer('jobs').publish('event', {});
    await expect
      .poll(() => handler.mock.calls.length, { timeout: 200 })
      .toBe(1);
  } finally {
    gate.release();
    await starting;
    await service.shutdown();
  }
});

it('does not release an unregister wait before its handler when pause rejects', async () => {
  const memory = createInMemoryBackendFactory();
  const gate = barrier();
  const entered = barrier();
  const service = createQueueService(
    {
      namespace: 'pause-rejected',
      queueBackend: 'probe',
      shutdownTimeoutMs: 0,
      cancellationGraceMs: 0,
    },
    { logger: { warn: vi.fn(), error: vi.fn() } },
  );
  service.registerBackend('probe', (name, options, metadata) => {
    const backend = memory(name, options, metadata);
    if (metadata?.withBlockingConnection)
      backend.disconnectBlocking = async () => {
        throw new Error('pause failure');
      };
    return backend;
  });
  const off = service.consumer('jobs').consume(async () => {
    entered.release();
    await gate.promise;
  });
  await service.setup();
  await service.producer('jobs').publish('event', {});
  await entered.promise;
  let finished = false;
  const removing = off()
    .catch(() => {})
    .finally(() => {
      finished = true;
    });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(finished).toBe(false);
    gate.release();
    await removing;
    expect(finished).toBe(true);
  } finally {
    gate.release();
    await removing;
    await service.shutdown().catch(() => {});
  }
});

it('waits for dynamic Worker readiness before resuming a newly registered handler', async () => {
  const gate = barrier();
  const entered = barrier();
  const memory = createInMemoryBackendFactory();
  const resume = vi.spyOn(Worker.prototype, 'resume');
  const service = createQueueService({
    namespace: 'dynamic-pause',
    queueBackend: 'probe',
  });
  service.registerBackend('probe', (name, options, metadata) => {
    const backend = memory(name, options, metadata);
    if (metadata?.withBlockingConnection)
      backend.waitUntilReady = async () => {
        entered.release();
        await gate.promise;
      };
    return backend;
  });
  service.producer('jobs');
  await service.setup();
  const off = service.consumer('jobs').consume(async () => {});
  await entered.promise;
  await off();
  const handler = vi.fn(async () => {});
  service.consumer('jobs').consume(handler);
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(resume).not.toHaveBeenCalled();
    gate.release();
    await service.producer('jobs').publish('event', {});
    await expect.poll(() => handler.mock.calls.length).toBe(1);
  } finally {
    gate.release();
    await service.shutdown();
    resume.mockRestore();
  }
});

it('does not lose a new resume request while the previous resume is settling', async () => {
  const service = createQueueService({ namespace: 'resume-cycle' });
  const firstOff = service.consumer('jobs').consume(async () => {});
  await service.setup();
  try {
    await firstOff();
    const secondOff = service.consumer('jobs').consume(async () => {});
    await Promise.resolve();
    await Promise.resolve();
    const removing = secondOff();
    const handler = vi.fn(async () => {});
    service.consumer('jobs').consume(handler);
    await removing;
    await service.producer('jobs').publish('event', {});
    await expect
      .poll(() => handler.mock.calls.length, { timeout: 300 })
      .toBe(1);
  } finally {
    await service.shutdown();
  }
});
