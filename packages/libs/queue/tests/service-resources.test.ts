import { EventEmitter } from 'node:events';
import { PostgresConnection, PostgresQueueBackend } from 'bullmq';
import type {
  BackendFactory,
  PgPool,
  PgPoolClient,
  PgQueryResult,
  QueueBaseOptions,
} from 'bullmq';
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
class ResourceBackend extends PostgresQueueBackend {
  readonly drained = vi.fn();
  readonly closed = vi.fn();
  constructor(
    name: string,
    options: QueueBaseOptions,
    private readonly ready: Promise<void>,
  ) {
    super(new PostgresConnection(new NoNetworkPool()), name, options);
  }
  override async waitUntilReady(): Promise<void> {
    await this.ready;
  }
  override async setQueueMeta(): Promise<number> {
    return 1;
  }
  override async drain(delayed: boolean): Promise<void> {
    this.drained(delayed);
  }
  override async close(): Promise<void> {
    this.closed();
    await super.close();
  }
}
const services: QueueService[] = [];
afterEach(async () => {
  await Promise.allSettled(
    services.splice(0).map((service) => service.shutdown()),
  );
});
function fixture(queues = {}, ready: Promise<void> = Promise.resolve()) {
  const resources: ResourceBackend[] = [];
  const factory = vi.fn<BackendFactory>((name, options) => {
    const result = new ResourceBackend(name, options, ready);
    resources.push(result);
    return result;
  });
  const service = createQueueService({
    namespace: 'app',
    queueBackend: 'probe',
    queues,
  });
  services.push(service);
  service.registerBackend('probe', factory);
  return { service, factory, resources };
}

describe('queue service resource initialization', () => {
  it('allows pre-setup facades, configure and consume but rejects publishing as not ready', async () => {
    const { service, factory } = fixture();
    await service.manager('jobs').configure({ concurrency: 2 });
    const unregister = service.consumer('jobs').consume(async () => {});
    await expect(service.producer('jobs').publish('work', {})).rejects.toThrow(
      /not ready/u,
    );
    await unregister();
    expect(factory).not.toHaveBeenCalled();
  });

  it('does not create business resources just because a queue override exists', async () => {
    const { service, factory } = fixture({ reserved: { concurrency: 4 } });
    await service.setup();
    expect(factory).not.toHaveBeenCalled();
  });

  it('validates every requested queue before initializing any resource', async () => {
    const { service, factory } = fixture({ bad: { concurrency: 0 } });
    service.producer('valid');
    service.producer('bad');
    await expect(service.setup()).rejects.toThrow(/concurrency/u);
    expect(factory).not.toHaveBeenCalled();
  });

  it('validates configured namespaces before initializing requested queues', async () => {
    const { service, factory } = fixture({
      unused: { namespace: 'bad\u0000' },
    });
    service.producer('valid');
    await expect(service.setup()).rejects.toThrow(/namespace/u);
    expect(factory).not.toHaveBeenCalled();
  });

  it('waits for readiness before returning setup or allowing resource operations', async () => {
    let release = (): void => {};
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deferred = { promise, resolve: (): void => release() };
    const { service, resources } = fixture({}, deferred.promise);
    const manager = service.manager('jobs');
    const setup = service.setup();
    const drain = manager.drain();
    try {
      await Promise.resolve();
      expect(resources[0]?.drained).not.toHaveBeenCalled();
    } finally {
      deferred.resolve();
    }
    await setup;
    await drain;
    expect(resources[0]?.drained).toHaveBeenCalledTimes(1);
  });

  it('initializes an undeclared post-setup queue once for concurrent operations', async () => {
    const { service, factory, resources } = fixture();
    await service.setup();
    const manager = service.manager('dynamic');
    await Promise.all([
      manager.drain(),
      manager.drain(),
      service.manager('dynamic').drain(),
    ]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(resources[0]?.drained).toHaveBeenCalledTimes(3);
  });

  it('isolates a new queue initialization failure from existing ready queues', async () => {
    const { service, factory, resources } = fixture();
    const existing = service.manager('existing');
    await service.setup();
    factory.mockImplementationOnce(() => {
      throw new Error('new queue initialization failed');
    });
    await expect(service.manager('new').drain()).rejects.toThrow(
      /new queue initialization failed/u,
    );
    await existing.drain();
    expect(resources[0]?.drained).toHaveBeenCalledTimes(1);
    expect(resources[0]?.closed).not.toHaveBeenCalled();
  });
});
