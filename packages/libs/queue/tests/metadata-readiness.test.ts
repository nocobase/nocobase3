import { expect, it } from 'vitest';
import { createQueueService } from '../src/service.js';
import { createInMemoryBackendFactory } from '../src/backends/in-memory/index.js';

it('does not start consumption or resolve setup while default metadata is pending', async () => {
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  let workers = 0;
  const memory = createInMemoryBackendFactory();
  const service = createQueueService({
    namespace: 'metadata',
    queueBackend: 'probe',
    setupTimeoutMs: 1000,
  });
  service.registerBackend('probe', (name, options, metadata) => {
    const backend = memory(name, options, metadata);
    if (metadata?.withBlockingConnection) workers += 1;
    else {
      const original = backend.setQueueMeta.bind(backend);
      backend.setQueueMeta = async (...args) => {
        writes += 1;
        await gate;
        return original(...args);
      };
    }
    return backend;
  });
  service.consumer('jobs').consume(async () => {});
  let ready = false;
  const starting = service.setup().then(() => {
    ready = true;
  });
  try {
    await expect.poll(() => writes).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ready).toBe(false);
    expect(workers).toBe(0);
    release();
    await starting;
    expect(workers).toBe(1);
    expect(writes).toBe(1);
  } finally {
    release();
    await starting.catch(() => {});
    await service.shutdown();
  }
});

it('propagates default metadata errors rather than accepting a producer that failed initialization', async () => {
  const memory = createInMemoryBackendFactory();
  const failure = new Error('metadata rejected');
  const service = createQueueService({
    namespace: 'metadata-error',
    queueBackend: 'probe',
  });
  service.registerBackend('probe', (name, options, metadata) => {
    const backend = memory(name, options, metadata);
    backend.setQueueMeta = async () => {
      throw failure;
    };
    return backend;
  });
  service.producer('jobs');
  try {
    await expect(service.setup()).rejects.toBe(failure);
  } finally {
    await service.shutdown();
  }
});
