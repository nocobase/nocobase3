import { expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { ServiceContainer } from '@nocobase/service-provider';
import { createLogging } from '@nocobase/logging';
import { AppConfig, createConfigPaths } from '../src/config/index.js';
import { loggingToken } from '../src/logging/index.js';
import { QueueServiceProvider, queueServiceToken } from '../src/queue/index.js';

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

it.each(['production', 'develop'])(
  'warns on actual memory initialization in %s',
  async (environment) => {
    const config = new AppConfig();
    await config.loadAll();
    config.mergeDefaults({ queue: { environment } });
    const container = new ServiceContainer();
    const logging = createLogging({ level: 'silent' });
    const logger = logging.getLogger();
    const warn = vi.spyOn(logger, 'warn');
    vi.spyOn(logger, 'child').mockReturnValue(logger);
    container.instance(loggingToken, logging);
    const provider = new QueueServiceProvider({
      appName: 'warning-app',
      publicBasePath: '',
      config,
      paths: createConfigPaths({ rootDir: process.cwd() }),
      router: new Hono(),
      container,
    });
    provider.register();
    const service = container.resolve(queueServiceToken);
    try {
      await provider.start();
      expect(warn).not.toHaveBeenCalled();
      await service.producer('late').publish('event', {});
      if (environment === 'develop') expect(warn).not.toHaveBeenCalled();
      else
        expect(warn).toHaveBeenCalledWith(
          { namespace: 'warning-app', queue: 'late' },
          'Queue is running in memory mode. Jobs will be lost on restart.',
        );
    } finally {
      await provider.shutdown();
      vi.restoreAllMocks();
    }
  },
);
