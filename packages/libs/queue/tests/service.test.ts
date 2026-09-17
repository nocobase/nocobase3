import { EventEmitter } from 'node:events';
import type { PgPool, PgPoolClient, PgQueryResult } from 'bullmq';
import { PostgresConnection, PostgresQueueBackend } from 'bullmq';
import type { BackendFactory } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueueService } from '../src/service.js';
import type { QueueService } from '../src/service.js';

class NoNetworkPool extends EventEmitter implements PgPool {
  async connect(): Promise<PgPoolClient> {
    throw new Error('Unexpected network acquisition');
  }
  async query<R>(): Promise<PgQueryResult<R>> {
    throw new Error('Unexpected query');
  }
  async end(): Promise<void> {}
}

/** Full upstream backend declaration, with only startup lifecycle under test replaced. */
class StartupBackend extends PostgresQueueBackend {
  override async waitUntilReady(): Promise<void> {}
  override async setQueueMeta(): Promise<number> {
    return 1;
  }
}

const services: QueueService[] = [];
function service(backend = 'probe'): QueueService {
  const result = createQueueService({
    namespace: 'app',
    queueBackend: backend,
  });
  services.push(result);
  return result;
}
function factory(): ReturnType<typeof vi.fn<BackendFactory>> {
  return vi.fn<BackendFactory>((name, options) => {
    const pool = new NoNetworkPool();
    return new StartupBackend(new PostgresConnection(pool), name, options);
  });
}
afterEach(async () => {
  await Promise.allSettled(
    services.splice(0).map((instance) => instance.shutdown()),
  );
});

describe('application-private queue service', () => {
  it('does not initialize a backend when creating or retrieving facades', () => {
    const backend = factory();
    const instance = service();
    instance.registerBackend('probe', backend);
    instance.producer('jobs');
    instance.manager('jobs');
    instance.consumer('jobs');
    expect(backend).not.toHaveBeenCalled();
  });

  it.each(['redis', 'postgres', 'inMemory', 'probe'])(
    'rejects duplicate backend %s immediately',
    (name) => {
      const instance = service();
      const backend = factory();
      if (name === 'probe') instance.registerBackend(name, backend);
      expect(() => instance.registerBackend(name, backend)).toThrow(
        /registered|duplicate/u,
      );
      expect(backend).not.toHaveBeenCalled();
    },
  );

  it('allows the same backend name in separate services', async () => {
    const a = service();
    const b = service();
    const aFactory = factory();
    const bFactory = factory();
    a.registerBackend('probe', aFactory);
    b.registerBackend('probe', bFactory);
    a.producer('jobs');
    b.producer('jobs');
    await a.setup();
    expect(aFactory).toHaveBeenCalledTimes(1);
    expect(bFactory).not.toHaveBeenCalled();
    await b.setup();
    expect(bFactory).toHaveBeenCalledTimes(1);
    expect(aFactory.mock.results[0]?.value).not.toBe(
      bFactory.mock.results[0]?.value,
    );
  });

  it('freezes registration synchronously when setup starts, including failed setup', async () => {
    const instance = service('missing');
    const pending = instance.setup();
    expect(() => instance.registerBackend('later', factory())).toThrow(
      /setup|frozen/u,
    );
    await expect(pending).rejects.toThrow(/missing/u);
    expect(() => instance.registerBackend('missing', factory())).toThrow(
      /setup|frozen/u,
    );
  });

  it('defers unknown backend validation until setup', async () => {
    const instance = service('unknown-backend');
    expect(() => instance.consumer('jobs')).not.toThrow();
    await expect(instance.setup()).rejects.toThrow(/unknown-backend/u);
  });

  it('caches all facade identities per logical queue and per service', () => {
    const a = service();
    const b = service();
    for (const method of ['producer', 'consumer', 'manager'] as const) {
      expect(a[method]('__proto__')).toBe(a[method]('__proto__'));
      expect(a[method]('jobs')).not.toBe(a[method]('Jobs'));
      expect(a[method]('jobs')).not.toBe(b[method]('jobs'));
    }
  });

  it('asks the explicit factory for a separate Worker backend and closes the Queue on failure', async () => {
    const instance = service();
    const backend = factory();
    let close: ReturnType<typeof vi.spyOn> | undefined;
    const roles: boolean[] = [];
    instance.registerBackend('probe', (name, options, role) => {
      roles.push(role?.withBlockingConnection === true);
      if (role?.withBlockingConnection) throw new Error('worker-probe');
      const result = backend(name, options, role);
      close = vi.spyOn(result, 'close');
      return result;
    });
    instance.producer('jobs');
    instance.consumer('jobs').consume(async () => {});
    await expect(instance.setup()).rejects.toThrow(/worker-probe/u);
    expect(roles).toEqual([false, true]);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('connects the producer facade to the initialized private queue', async () => {
    const instance = service('memory-test');
    const { createInMemoryBackendFactory } =
      await import('../src/backends/in-memory/index.js');
    instance.registerBackend('memory-test', createInMemoryBackendFactory());
    const producer = instance.producer('jobs');
    await expect(producer.publish('event', {})).rejects.toThrow(/not ready/u);
    await instance.setup();
    expect(await producer.publish('event', {})).toEqual({
      jobId: expect.any(String),
    });
    expect(
      await producer.publishMany([{ channel: 'event', message: 2 }]),
    ).toHaveLength(1);
  });
  it('dispatches decoded messages to all registered handlers through one real Worker', async () => {
    const instance = service('memory-test');
    const { createInMemoryBackendFactory } =
      await import('../src/backends/in-memory/index.js');
    const backend = vi.fn(createInMemoryBackendFactory());
    instance.registerBackend('memory-test', backend);
    const calls: unknown[] = [];
    instance.consumer('jobs').consume(async (channel, message, signal) => {
      calls.push([channel, message, signal.aborted]);
    });
    instance.consumer('jobs').consume(async (_channel, message) => {
      calls.push(message);
    });
    await instance.setup();
    await instance.producer('jobs').publish('event', { value: 1 });
    await expect.poll(() => calls.length).toBe(2);
    expect(calls).toContainEqual(['event', { value: 1 }, false]);
    expect(calls).toContainEqual({ value: 1 });
    expect(
      backend.mock.calls.filter((call) => call[2]?.withBlockingConnection),
    ).toHaveLength(1);
  });
  it('keeps jobs pending after last unregister and resumes the same Worker on registration', async () => {
    const { Worker } = await import('bullmq');
    const pause = vi.spyOn(Worker.prototype, 'pause');
    const instance = service('memory-test');
    const { createInMemoryBackendFactory } =
      await import('../src/backends/in-memory/index.js');
    const backend = vi.fn(createInMemoryBackendFactory());
    instance.registerBackend('memory-test', backend);
    const first = vi.fn(async () => {});
    const off = instance.consumer('jobs').consume(first);
    await instance.setup();
    await off();
    expect(pause).toHaveBeenCalledWith(true);
    pause.mockRestore();
    await instance.producer('jobs').publish('event', { value: 2 });
    const second = vi.fn(async () => {});
    instance.consumer('jobs').consume(second);
    await expect.poll(() => second.mock.calls.length).toBe(1);
    expect(first).not.toHaveBeenCalled();
    expect(
      backend.mock.calls.filter((call) => call[2]?.withBlockingConnection),
    ).toHaveLength(1);
  });
  it('returns a claimed job to waiting when its last handler unregisters before dispatch', async () => {
    const instance = service('memory-test');
    const { createInMemoryBackendFactory } =
      await import('../src/backends/in-memory/index.js');
    const memory = createInMemoryBackendFactory();
    let claimed = false;
    let off: () => Promise<void> = async () => {};
    let inspect: ((id: string) => Promise<string>) | undefined;
    instance.registerBackend('memory-test', (name, options, metadata) => {
      const backend = memory(name, options, metadata);
      if (metadata?.withBlockingConnection) {
        inspect = (id) => backend.getState(id);
        const claim = backend.moveToActive.bind(backend);
        vi.spyOn(backend, 'moveToActive').mockImplementation(
          async (...args) => {
            const result = await claim(...args);
            if (result[1]) {
              claimed = true;
              void off();
            }
            return result;
          },
        );
      }
      return backend;
    });
    const handler = vi.fn(async () => {});
    off = instance.consumer('jobs').consume(handler);
    await instance.setup();
    const receipt = await instance.producer('jobs').publish('event', {});
    await expect.poll(() => claimed).toBe(true);
    await expect.poll(async () => inspect?.(receipt.jobId)).toBe('waiting');
    expect(handler).not.toHaveBeenCalled();
  });
});
