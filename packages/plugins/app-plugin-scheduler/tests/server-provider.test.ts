import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  queueJobFactoryRegistryToken,
  queueManagerToken,
} from '@nocobase/app-server/queue';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createQueueJobFactoryRegistry,
  type NocoBaseQueueManager,
} from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { ScheduleDispatchJob } from '../server/jobs/dispatch.js';
import {
  SchedulerProvider,
  schedulerStartupModeToken,
} from '../server/providers/scheduler.js';
import {
  DefaultSchedulerService,
  schedulerServiceToken,
} from '../server/services/scheduler.js';

describe('@nocobase/app-plugin-scheduler', () => {
  it('registers exactly one service, as a lazy singleton', () => {
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, {} as DatabaseManager);
    container.instance(queueManagerToken, {
      schedules: () => ({
        upsert: vi.fn(),
        get: vi.fn(),
        list: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      }),
    } as NocoBaseQueueManager);
    const provider = new SchedulerProvider({
      appName: 'test',
      publicBasePath: '',
      config: {} as never,
      paths: {} as never,
      router: new Hono(),
      container,
    } satisfies AppPluginApplication);

    expect(provider.name).toBe('@nocobase/app-plugin-scheduler');
    expect(container.resolveIfCreated(schedulerServiceToken)).toBeUndefined();

    provider.register();

    const service = container.resolve(schedulerServiceToken);
    expect(service).toBeInstanceOf(DefaultSchedulerService);
    expect(container.resolve(schedulerServiceToken)).toBe(service);
    // The registries and stores behind the service are the provider's own
    // parts. Nothing else may be resolvable, or the plugin would be handing
    // out more than the one service it means to expose.
    expect(schedulerTokenNames(container)).toEqual([
      '@nocobase/app-plugin-scheduler/service',
    ]);
  });

  it('registers the bridge Job and syncs before starting its worker', async () => {
    const events: string[] = [];
    const { provider, queue, service } = lifecycleProvider(undefined, events);

    await provider.boot();
    await provider.start();

    expect(queue.registerJob).toHaveBeenCalledWith(ScheduleDispatchJob);
    expect(events).toEqual([
      'queue:init',
      'scheduler:sync:false',
      'queue:create-worker',
      'worker:start',
    ]);
    expect(service.sync).toHaveBeenCalledWith(false);
    expect(queue.createWorker).toHaveBeenCalledWith({
      queues: ['schedule'],
      concurrency: 1,
    });
  });

  it('runs finalize synchronization without creating a worker in sync-only mode', async () => {
    const events: string[] = [];
    const { provider, container, queue, service } = lifecycleProvider(
      undefined,
      events,
    );
    container.instance(schedulerStartupModeToken, {
      kind: 'sync-only',
      finalize: true,
    });

    await provider.boot();
    await provider.start();

    expect(events).toEqual(['queue:init', 'scheduler:sync:true']);
    expect(service.sync).toHaveBeenCalledWith(true);
    expect(queue.createWorker).not.toHaveBeenCalled();
  });
});

function lifecycleProvider(queueConfigValue = {}, events: string[] = []) {
  const container = new ServiceContainer();
  const worker = {
    id: 'scheduler-worker',
    start: vi.fn(async () => {
      events.push('worker:start');
    }),
    stop: vi.fn(async () => {}),
  };
  const queue = {
    init: vi.fn(async () => {
      events.push('queue:init');
    }),
    use: vi.fn(),
    registerJob: vi.fn(),
    dispatch: vi.fn(),
    dispatchMany: vi.fn(),
    schedules: vi.fn(() => ({
      upsert: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    })),
    createWorker: vi.fn(() => {
      events.push('queue:create-worker');
      return worker;
    }),
    close: vi.fn(),
  } satisfies NocoBaseQueueManager;
  const service = {
    list: vi.fn(async () => []),
    listOccurrences: vi.fn(async () => []),
    sync: vi.fn(async (finalize = false) => {
      events.push(`scheduler:sync:${finalize}`);
    }),
    reconcileOccurrences: vi.fn(async () => 0),
  };
  container.instance(
    queueJobFactoryRegistryToken,
    createQueueJobFactoryRegistry((JobClass) => new JobClass()),
  );
  container.instance(queueManagerToken, queue);
  container.instance(
    schedulerServiceToken,
    service as unknown as DefaultSchedulerService,
  );
  const provider = new SchedulerProvider({
    appName: 'test',
    publicBasePath: '',
    config: { get: () => queueConfigValue } as never,
    paths: {} as never,
    router: new Hono(),
    container,
  } satisfies AppPluginApplication);
  return { provider, container, queue, service, worker };
}

function schedulerTokenNames(container: ServiceContainer): string[] {
  // ServiceContainer keys its bindings by the token object itself, so what the
  // provider registered is read back from that map rather than probed token by
  // token: the assertion is about what is *not* there.
  const bindings = (
    container as unknown as { bindings: Map<{ name: string }, unknown> }
  ).bindings;
  return [...bindings.keys()]
    .map((token) => token.name)
    .filter((name) => name.startsWith('@nocobase/app-plugin-scheduler/'))
    .sort();
}
