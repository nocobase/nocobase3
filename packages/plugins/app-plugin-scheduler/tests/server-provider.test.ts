import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  AppScheduleDefinitionContributions,
  appScheduleDefinitionContributionsToken,
} from '@nocobase/app-server/plugins';
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
import { SchedulerProvider } from '../server/providers/scheduler.js';
import { DefaultSchedulerService } from '../server/services/scheduler.js';
import { ScheduleTargetRegistry } from '../server/schedules/registry.js';
import {
  jobDispatchRegistryToken,
  scheduleOccurrenceStoreToken,
  scheduleStoreToken,
  scheduleTargetRegistryToken,
  schedulerServiceToken,
  schedulerStartupModeToken,
} from '../server/tokens.js';

describe('@nocobase/app-plugin-scheduler', () => {
  it('registers its service as a lazy singleton', () => {
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, {} as DatabaseManager);
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
    expect(container.resolve(scheduleTargetRegistryToken)).toBeInstanceOf(
      ScheduleTargetRegistry,
    );
    expect(
      container.resolve(scheduleTargetRegistryToken).get('job'),
    ).toBeDefined();
    expect(container.resolve(jobDispatchRegistryToken)).toBeDefined();
    expect(container.resolve(scheduleStoreToken)).toBeDefined();
    expect(container.resolve(scheduleOccurrenceStoreToken)).toBeDefined();
  });

  it('fails boot without the required Database Queue connection', async () => {
    const { provider } = lifecycleProvider({
      connections: { database: { driver: 'redis' } },
    });

    await expect(provider.boot()).rejects.toThrow(
      'requires a Database Queue connection named "database"',
    );
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

function lifecycleProvider(
  queueConfigValue = {
    connections: { database: { driver: 'database' } },
  },
  events: string[] = [],
) {
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
  };
  container.instance(
    queueJobFactoryRegistryToken,
    createQueueJobFactoryRegistry((JobClass) => new JobClass()),
  );
  container.instance(queueManagerToken, queue);
  container.instance(schedulerServiceToken, service);
  container.instance(
    appScheduleDefinitionContributionsToken,
    new AppScheduleDefinitionContributions(),
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
