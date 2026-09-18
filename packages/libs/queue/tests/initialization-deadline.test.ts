import { expect, it } from 'vitest';
import { createQueueService } from '../src/service.js';
import { createInMemoryBackendFactory } from '../src/backends/in-memory/index.js';
import { postgresDeadline } from '../src/backends/postgres-pool.js';

it('shares one setup deadline across queue and worker admission without leaking into handlers', async () => {
  const factory = createInMemoryBackendFactory();
  const scopes: (number | undefined)[] = [];
  let handled = false;
  let handlerScope: number | undefined;
  const service = createQueueService({
    namespace: 'deadline',
    queueBackend: 'probe',
    setupTimeoutMs: 1000,
  });
  service.registerBackend('probe', (name, options, metadata) => {
    scopes.push(postgresDeadline.getStore());
    const backend = factory(name, options, metadata);
    const ready = backend.waitUntilReady.bind(backend);
    backend.waitUntilReady = async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      await ready();
    };
    return backend;
  });
  service.producer('first');
  service.consumer('second').consume(async () => {
    handlerScope = postgresDeadline.getStore();
    handled = true;
  });
  try {
    await service.setup();
    expect(scopes).toHaveLength(3);
    expect(scopes.every((scope) => typeof scope === 'number')).toBe(true);
    expect(new Set(scopes).size).toBe(1);
    await service.producer('second').publish('work', {});
    await expect.poll(() => handled).toBe(true);
    expect(handlerScope).toBeUndefined();
  } finally {
    await service.shutdown();
  }
});

it('allocates fresh admission scopes for runtime queues and later worker activation', async () => {
  const factory = createInMemoryBackendFactory();
  const scopes: (number | undefined)[] = [];
  const service = createQueueService({
    namespace: 'late-deadline',
    queueBackend: 'probe',
    setupTimeoutMs: 1000,
  });
  service.registerBackend('probe', (name, options, metadata) => {
    scopes.push(postgresDeadline.getStore());
    return factory(name, options, metadata);
  });
  service.producer('early');
  try {
    await service.setup();
    const setupDeadline = scopes[0];
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.producer('late').publish('work', {});
    expect(scopes[1]).toBeGreaterThan(setupDeadline!);
    await new Promise((resolve) => setTimeout(resolve, 5));
    let received = false;
    let handlerScope: number | undefined;
    service.consumer('late').consume(async () => {
      handlerScope = postgresDeadline.getStore();
      received = true;
    });
    await expect.poll(() => received).toBe(true);
    expect(scopes[2]).toBeGreaterThan(scopes[1]!);
    expect(handlerScope).toBeUndefined();
  } finally {
    await service.shutdown();
  }
});
