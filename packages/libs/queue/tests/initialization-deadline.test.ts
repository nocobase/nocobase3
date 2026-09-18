import { expect, it, vi } from 'vitest';
import { createQueueService } from '../src/service.js';
import { createInMemoryBackendFactory } from '../src/backends/in-memory/index.js';
import { producerDeadline } from '../src/operation-deadline.js';

it('bounds combined queue and worker readiness by one setup budget', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const factory = createInMemoryBackendFactory();
  const closed: boolean[] = [];
  const roles: boolean[] = [];
  const handler = vi.fn();
  const service = createQueueService({
    namespace: 'deadline',
    queueBackend: 'probe',
    setupTimeoutMs: 100,
  });
  service.registerBackend('probe', (name, options, metadata) => {
    const worker = metadata?.withBlockingConnection === true;
    roles.push(worker);
    const backend = factory(name, options, metadata);
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
      setTimeout(resolve, 60);
    });
    const ready = backend.waitUntilReady.bind(backend);
    backend.waitUntilReady = async () => {
      await gate;
      await ready();
    };
    const close = backend.close.bind(backend);
    backend.close = async (...args) => {
      closed.push(worker);
      release();
      await close(...args);
    };
    return backend;
  });
  service.consumer('jobs').consume(handler);
  let outcome: unknown;
  const setup = service.setup().catch((error: unknown) => {
    outcome = error;
  });
  try {
    await vi.advanceTimersByTimeAsync(60);
    expect(roles).toEqual([false, true]);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(40);
    await setup;
    expect(outcome).toMatchObject({
      message: 'Queue setup deadline exceeded',
    });
    expect(closed.sort()).toEqual([false, true]);
    expect(handler).not.toHaveBeenCalled();
  } finally {
    await vi.runAllTimersAsync();
    await service.shutdown();
    vi.useRealTimers();
  }
});

it('gives runtime queues and later workers fresh readiness budgets without leaking publication deadlines into handlers', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const factory = createInMemoryBackendFactory();
  const roles: boolean[] = [];
  const service = createQueueService({
    namespace: 'late-deadline',
    queueBackend: 'probe',
    setupTimeoutMs: 100,
  });
  service.registerBackend('probe', (name, options, metadata) => {
    roles.push(metadata?.withBlockingConnection === true);
    const backend = factory(name, options, metadata);
    const gate = new Promise<void>((resolve) => setTimeout(resolve, 60));
    const ready = backend.waitUntilReady.bind(backend);
    backend.waitUntilReady = async () => {
      await gate;
      await ready();
    };
    return backend;
  });
  service.producer('early');
  try {
    const setup = service.setup();
    await vi.advanceTimersByTimeAsync(60);
    await setup;
    await vi.advanceTimersByTimeAsync(100);
    const publication = service.producer('late').publish('work', {});
    await vi.advanceTimersByTimeAsync(60);
    await expect(publication).resolves.toHaveProperty('jobId');
    await vi.advanceTimersByTimeAsync(100);
    const scopes: (number | undefined)[] = [];
    producerDeadline.run(performance.now() + 1000, () => {
      service.consumer('late').consume(async () => {
        scopes.push(producerDeadline.getStore());
      });
    });
    await vi.advanceTimersByTimeAsync(60);
    expect(roles).toEqual([false, false, true]);
    expect(scopes).toEqual([undefined]);
  } finally {
    const closing = service.shutdown();
    await vi.advanceTimersByTimeAsync(100);
    await closing;
    vi.useRealTimers();
  }
});
