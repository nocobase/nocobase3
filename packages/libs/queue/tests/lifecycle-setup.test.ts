import { expect, it, vi } from 'vitest';
import { createQueueService } from '../src/service.js';
import { createInMemoryBackendFactory } from '../src/backends/in-memory/index.js';

it('aborts blocked readiness by closing its backend when setup budget expires', async () => {
  const service = createQueueService({
    namespace: 'setup',
    queueBackend: 'test',
    setupTimeoutMs: 20,
  });
  const factory = createInMemoryBackendFactory();
  let interrupt = (): void => {};
  const blocked = new Promise<void>((_resolve, reject) => {
    interrupt = () => reject(new Error('readiness cancelled'));
  });
  void blocked.catch(() => {});
  let closed = false;
  let workers = 0;
  service.registerBackend('test', (name, options, metadata) => {
    const backend = factory(name, options, metadata);
    if (metadata?.withBlockingConnection) workers++;
    vi.spyOn(backend, 'waitUntilReady').mockImplementation(() => blocked);
    const close = backend.close.bind(backend);
    backend.close = async (...args) => {
      closed = true;
      interrupt();
      await close(...args);
    };
    return backend;
  });
  service.consumer('jobs').consume(async () => {});
  let rejected = false;
  const starting = service.setup().catch(() => {
    rejected = true;
  });
  try {
    await expect.poll(() => rejected, { timeout: 1000 }).toBe(true);
    expect(closed).toBe(true);
    expect(workers).toBe(0);
  } finally {
    interrupt();
    await starting;
    await service.shutdown();
  }
});

it('does not run a Worker whose readiness arrives after shutdown begins', async () => {
  const { Worker } = await import('bullmq');
  const run = vi.spyOn(Worker.prototype, 'run');
  const service = createQueueService({
    namespace: 'late-worker',
    queueBackend: 'test',
  });
  const factory = createInMemoryBackendFactory();
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waiting = false;
  service.registerBackend('test', (name, options, metadata) => {
    const backend = factory(name, options, metadata);
    if (metadata?.withBlockingConnection)
      vi.spyOn(backend, 'waitUntilReady').mockImplementation(async () => {
        waiting = true;
        await gate;
      });
    return backend;
  });
  service.consumer('jobs').consume(async () => {});
  const starting = service.setup();
  void starting.catch(() => {});
  await expect.poll(() => waiting).toBe(true);
  const closing = service.shutdown();
  release();
  try {
    await Promise.allSettled([starting, closing]);
    expect(run).not.toHaveBeenCalled();
  } finally {
    run.mockRestore();
  }
});

it('bounds runtime queue initialization without disabling a ready queue', async () => {
  const service = createQueueService({
    namespace: 'dynamic-timeout',
    queueBackend: 'test',
    setupTimeoutMs: 20,
  });
  const factory = createInMemoryBackendFactory();
  let interrupt = (): void => {};
  const blocked = new Promise<void>((_resolve, reject) => {
    interrupt = () => reject(new Error('cancelled'));
  });
  void blocked.catch(() => {});
  let block = false;
  let closed = false;
  service.registerBackend('test', (...args) => {
    const backend = factory(...args);
    if (block) {
      vi.spyOn(backend, 'waitUntilReady').mockImplementation(() => blocked);
      const close = backend.close.bind(backend);
      backend.close = async (...values) => {
        closed = true;
        interrupt();
        await close(...values);
      };
    }
    return backend;
  });
  const healthy = service.producer('healthy');
  await service.setup();
  block = true;
  let rejected = false;
  const publishing = service
    .producer('blocked')
    .publish('event', {})
    .catch(() => {
      rejected = true;
    });
  try {
    await expect.poll(() => rejected, { timeout: 1000 }).toBe(true);
    expect(closed).toBe(true);
    await expect(healthy.publish('event', {})).resolves.toHaveProperty('jobId');
  } finally {
    interrupt();
    await publishing;
    await service.shutdown();
  }
});
