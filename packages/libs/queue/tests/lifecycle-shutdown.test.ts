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
});
