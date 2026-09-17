import { describe, expect, it } from 'vitest';
import { createQueueService } from '../src/service.js';

it('keeps a producer usable while a running handler finishes during shutdown', async () => {
  const service = createQueueService({ namespace: 'shutdown' });
  const producer = service.producer('jobs');
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = false;
  let published = false;
  service.consumer('jobs').consume(async () => {
    entered = true;
    await gate;
    await service.producer('jobs').publish('follow-up', {});
    published = true;
  });
  await service.setup();
  await producer.publish('initial', {});
  await expect.poll(() => entered).toBe(true);
  const closing = service.shutdown();
  release();
  await closing;
  expect(published).toBe(true);
  await expect(producer.publish('late', {})).rejects.toThrow();
});

describe('shutdown idempotency', () => {
  it('returns the same shutdown promise to concurrent callers', async () => {
    const service = createQueueService({ namespace: 'shutdown' });
    service.producer('jobs');
    await service.setup();
    const first = service.shutdown();
    const second = service.shutdown();
    await Promise.all([first, second]);
    expect(first).toBe(second);
  });
  it('waits for admitted producer operations before closing their backend', async () => {
    const service = createQueueService({
      namespace: 'producer-close',
      queueBackend: 'test',
    });
    const { createInMemoryBackendFactory } =
      await import('../src/backends/in-memory/index.js');
    const factory = createInMemoryBackendFactory();
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = false;
    let finished = false;
    let closedEarly = false;
    service.registerBackend('test', (...args) => {
      const backend = factory(...args);
      const add = backend.addJob.bind(backend);
      const close = backend.close.bind(backend);
      backend.addJob = async (...values) => {
        started = true;
        await gate;
        const id = await add(...values);
        finished = true;
        return id;
      };
      backend.close = async (...values) => {
        closedEarly = !finished;
        await close(...values);
      };
      return backend;
    });
    const producer = service.producer('jobs');
    await service.setup();
    const publishing = producer.publish('event', {});
    void publishing.catch(() => {});
    await expect.poll(() => started).toBe(true);
    const closing = service.shutdown();
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(closedEarly).toBe(false);
    } finally {
      release();
      await Promise.allSettled([publishing, closing]);
    }
    await expect(publishing).resolves.toHaveProperty('jobId');
  });
  it('does not report successful shutdown when Worker backend close fails', async () => {
    const service = createQueueService({
      namespace: 'close-failure',
      queueBackend: 'test',
    });
    const { createInMemoryBackendFactory } =
      await import('../src/backends/in-memory/index.js');
    const factory = createInMemoryBackendFactory();
    let recover = (): void => {};
    service.registerBackend('test', (name, options, metadata) => {
      const backend = factory(name, options, metadata);
      if (metadata?.withBlockingConnection) {
        const close = backend.close.bind(backend);
        let fail = true;
        recover = (): void => {
          fail = false;
        };
        backend.close = async (...args) => {
          if (fail) throw new Error('backend close failed');
          await close(...args);
        };
      }
      return backend;
    });
    service.consumer('jobs').consume(async () => {});
    await service.setup();
    try {
      await expect(service.shutdown()).rejects.toThrow();
    } finally {
      recover();
    }
  });
});

it('attempts every Queue cleanup even while another Queue close is pending', async () => {
  const { createInMemoryBackendFactory } =
    await import('../src/backends/in-memory/index.js');
  const factory = createInMemoryBackendFactory();
  const service = createQueueService({
    namespace: 'cleanup-progress',
    queueBackend: 'test',
  });
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let created = 0;
  let secondClosed = false;
  service.registerBackend('test', (...args) => {
    const backend = factory(...args);
    const first = created++ === 0;
    const close = backend.close.bind(backend);
    backend.close = async (...values) => {
      if (first) await gate;
      else secondClosed = true;
      await close(...values);
    };
    return backend;
  });
  service.producer('first');
  service.producer('second');
  await service.setup();
  const closing = service.shutdown();
  try {
    await expect.poll(() => secondClosed, { timeout: 500 }).toBe(true);
  } finally {
    release();
    await closing;
  }
});

it('reports unresolved resource cleanup within its cleanup budget and observes late settlement', async () => {
  const { vi } = await import('vitest');
  const { createInMemoryBackendFactory } =
    await import('../src/backends/in-memory/index.js');
  const factory = createInMemoryBackendFactory();
  const error = vi.fn();
  const warn = vi.fn();
  const service = createQueueService(
    { namespace: 'cleanup-budget', queueBackend: 'test' },
    { logger: { error, warn } },
  );
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = false;
  let ended = false;
  service.registerBackend('test', (...args) => {
    const backend = factory(...args);
    const close = backend.close.bind(backend);
    backend.close = async (...values) => {
      entered = true;
      await gate;
      await close(...values);
      ended = true;
    };
    return backend;
  });
  service.producer('jobs');
  await service.setup();
  vi.useFakeTimers();
  let failure: unknown;
  let finished = false;
  const closing = service
    .shutdown()
    .catch((reason: unknown) => {
      failure = reason;
    })
    .finally(() => {
      finished = true;
    });
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(entered).toBe(true);
    await vi.advanceTimersByTimeAsync(5001);
    expect(finished).toBe(true);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(error).toHaveBeenCalled();
    expect(ended).toBe(false);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(ended).toBe(true);
    expect(warn).toHaveBeenCalled();
  } finally {
    release();
    await closing;
    vi.useRealTimers();
  }
});

it.each(['configuration', 'publish'] as const)(
  'interrupts pending %s when the shutdown drain budget expires',
  async (operation) => {
    const { createInMemoryBackendFactory } =
      await import('../src/backends/in-memory/index.js');
    const factory = createInMemoryBackendFactory();
    const service = createQueueService({
      namespace: 'configure-deadline',
      queueBackend: 'test',
      shutdownTimeoutMs: 20,
      cancellationGraceMs: 20,
    });
    let interrupt = (): void => {};
    const gate = new Promise<void>((_resolve, reject) => {
      interrupt = () => reject(new Error('configuration interrupted'));
    });
    void gate.catch(() => {});
    let entered = false;
    let closed = false;
    service.registerBackend('test', (...args) => {
      const backend = factory(...args);
      const setMeta = backend.setQueueMeta.bind(backend);
      backend.setQueueMeta = async (meta) => {
        if (meta.max !== undefined) {
          entered = true;
          await gate;
        }
        return setMeta(meta);
      };
      const addJob = backend.addJob.bind(backend);
      backend.addJob = async (...values) => {
        if (operation === 'publish') {
          entered = true;
          await gate;
        }
        return addJob(...values);
      };
      const close = backend.close.bind(backend);
      backend.close = async (...values) => {
        interrupt();
        await close(...values);
        closed = true;
      };
      return backend;
    });
    const manager = service.manager('jobs');
    await service.setup();
    const configuring =
      operation === 'configuration'
        ? manager.configure({
            rateLimit: { max: 1, duration: 100 },
          })
        : service.producer('jobs').publish('event', {});
    void configuring.catch(() => {});
    await expect.poll(() => entered).toBe(true);
    let finished = false;
    const closing = service
      .shutdown()
      .catch(() => {})
      .finally(() => {
        finished = true;
      });
    try {
      await expect.poll(() => finished, { timeout: 1000 }).toBe(true);
      expect(closed).toBe(true);
      await expect(configuring).rejects.toThrow('configuration interrupted');
    } finally {
      interrupt();
      await closing;
    }
  },
);
