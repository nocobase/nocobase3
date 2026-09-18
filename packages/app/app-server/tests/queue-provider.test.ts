import { afterEach, expect, expectTypeOf, it, vi } from 'vitest';
import type { QueueOptions } from '@nocobase/queue';
import { Application } from '../src/application/index.js';
import { Hono } from 'hono';
import { ServiceContainer } from '@nocobase/service-provider';
import { createLogging } from '@nocobase/logging';
import { AppConfig, createConfigPaths } from '../src/config/index.js';
import { loggingToken } from '../src/logging/index.js';
import {
  QueueServiceProvider,
  queueServiceToken,
  type AppQueueServiceConfig,
} from '../src/queue/index.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('keeps application queue configuration identical to QueueOptions', () => {
  expectTypeOf<AppQueueServiceConfig>().toEqualTypeOf<QueueOptions>();
  expectTypeOf<'environment'>().not.toExtend<keyof AppQueueServiceConfig>();
});

it('warns by default only after a requested memory queue initializes at start', async () => {
  vi.stubEnv('NODE_ENV', 'develop');
  const config = new AppConfig();
  await config.loadAll();
  config.mergeDefaults({
    app: { name: 'default-warning-app', publicBasePath: '' },
    queue: { namespace: 'explicit-namespace' },
  });
  const app = new Application({
    config,
    paths: createConfigPaths({ rootDir: process.cwd() }),
  });
  const logging = createLogging({ level: 'silent' });
  const logger = logging.getLogger();
  const warn = vi.spyOn(logger, 'warn');
  vi.spyOn(logger, 'child').mockReturnValue(logger);
  app.container.instance(loggingToken, logging);
  app.addServiceProvider(QueueServiceProvider);
  app.registerProviders();
  const service = app.container.resolve(queueServiceToken);
  service.consumer('requested').consume(async () => {});
  expect(warn).not.toHaveBeenCalled();
  try {
    await app.start();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      { namespace: 'explicit-namespace', queue: 'requested' },
      'Queue is running in memory mode. Jobs will be lost on restart.',
    );
    await service.producer('requested').publish('event', {});
    expect(warn).toHaveBeenCalledTimes(1);
  } finally {
    await app.shutdown();
  }
});

it('rejects queue.environment instead of treating it as provider context', async () => {
  const config = new AppConfig();
  await config.loadAll();
  config.mergeDefaults({ queue: { environment: 'develop' } });
  const container = new ServiceContainer();
  const logging = createLogging({ level: 'silent' });
  const logger = logging.getLogger();
  const warn = vi.spyOn(logger, 'warn');
  vi.spyOn(logger, 'child').mockReturnValue(logger);
  container.instance(loggingToken, logging);
  const provider = new QueueServiceProvider({
    appName: 'invalid-config-app',
    publicBasePath: '',
    config,
    paths: createConfigPaths({ rootDir: process.cwd() }),
    router: new Hono(),
    container,
  });
  provider.register();
  try {
    await expect(provider.start()).rejects.toThrow('environment');
    expect(warn).not.toHaveBeenCalled();
  } finally {
    await provider.shutdown();
  }
});

it('registers one lazy service and activates handlers only at start', async () => {
  const config = new AppConfig();
  await config.loadAll();
  const container = new ServiceContainer();
  container.instance(loggingToken, createLogging({ level: 'silent' }));
  const provider = new QueueServiceProvider({
    appName: 'queue-provider-test',
    publicBasePath: '',
    config,
    paths: createConfigPaths({ rootDir: process.cwd() }),
    router: new Hono(),
    container,
  });
  provider.register();
  expect(container.resolveIfCreated(queueServiceToken)).toBeUndefined();
  const service = container.resolve(queueServiceToken);
  expect(container.resolve(queueServiceToken)).toBe(service);
  const received: unknown[] = [];
  service.consumer('jobs').consume(async (_channel, message) => {
    received.push(message);
  });
  await expect(service.producer('jobs').publish('event', 1)).rejects.toThrow();
  expect(received).toEqual([]);
  try {
    await provider.start();
    await service.producer('jobs').publish('event', 42);
    await expect.poll(() => received).toEqual([42]);
  } finally {
    await provider.shutdown();
  }
  expect(() => service.producer('jobs')).toThrow('shutting down');
});

it('keeps same-name queue handlers isolated between application containers', async () => {
  const received = [[], []] as unknown[][];
  const providers: QueueServiceProvider[] = [];
  const containers: ServiceContainer[] = [];
  for (const name of ['first-app', 'second-app']) {
    const config = new AppConfig();
    await config.loadAll();
    const container = new ServiceContainer();
    container.instance(loggingToken, createLogging({ level: 'silent' }));
    const provider = new QueueServiceProvider({
      appName: name,
      publicBasePath: '',
      config,
      paths: createConfigPaths({ rootDir: process.cwd() }),
      router: new Hono(),
      container,
    });
    provider.register();
    const index = providers.length;
    container
      .resolve(queueServiceToken)
      .consumer('shared-name')
      .consume(async (_channel, message) => {
        received[index]!.push(message);
      });
    providers.push(provider);
    containers.push(container);
  }
  try {
    await Promise.all(providers.map((provider) => provider.start()));
    await containers[0]!
      .resolve(queueServiceToken)
      .producer('shared-name')
      .publish('event', 'first');
    await containers[1]!
      .resolve(queueServiceToken)
      .producer('shared-name')
      .publish('event', 'second');
    await expect.poll(() => received).toEqual([['first'], ['second']]);
    await providers[0]!.shutdown();
    await containers[1]!
      .resolve(queueServiceToken)
      .producer('shared-name')
      .publish('event', 'still-running');
    await expect.poll(() => received[1]).toEqual(['second', 'still-running']);
  } finally {
    await Promise.all(providers.map((provider) => provider.shutdown()));
  }
});

it.each(['production', 'test', '', undefined, 'develop', 'development'])(
  'uses explicit App nodeEnv %s for warnings only when memory initializes',
  async (nodeEnv) => {
    const development = nodeEnv === 'develop' || nodeEnv === 'development';
    vi.stubEnv('NODE_ENV', development ? 'production' : 'development');
    const config = new AppConfig();
    await config.loadAll();
    config.mergeDefaults({
      app: { name: 'warning-app', publicBasePath: '' },
      queue: { queues: { unused: { queueBackend: 'inMemory' } } },
    });
    const app = new Application({
      config,
      paths: createConfigPaths({ rootDir: process.cwd() }),
    });
    const container = app.container;
    const logging = createLogging({ level: 'silent' });
    const logger = logging.getLogger();
    const warn = vi.spyOn(logger, 'warn');
    vi.spyOn(logger, 'child').mockReturnValue(logger);
    container.instance(loggingToken, logging);
    app.addServiceProvider(QueueServiceProvider, { nodeEnv });
    app.registerProviders();
    expect(container.resolveIfCreated(queueServiceToken)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    const service = container.resolve(queueServiceToken);
    expect(warn).not.toHaveBeenCalled();
    try {
      await app.start();
      expect(warn).not.toHaveBeenCalled();
      const producer = service.producer('late');
      expect(warn).not.toHaveBeenCalled();
      await producer.publish('event', {});
      await producer.publish('event', {});
      if (development) expect(warn).not.toHaveBeenCalled();
      else {
        expect(warn).toHaveBeenCalledExactlyOnceWith(
          { namespace: 'warning-app', queue: 'late' },
          'Queue is running in memory mode. Jobs will be lost on restart.',
        );
      }
    } finally {
      await app.shutdown();
    }
  },
);
