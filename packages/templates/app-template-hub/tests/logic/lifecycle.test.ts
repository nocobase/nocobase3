// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import { AppConfig, createConfigPaths } from '@nocobase/app-server/config';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import {
  defineServerPlugin,
  defineServerPlugins,
} from '@nocobase/app-server/plugins';
import type { UnregisterHandler } from '@nocobase/queue';
import { createApp } from '../../server/app.js';
import appRuntime from '../../server/runtime.js';

import {
  RealtimeProvider,
  realtimeServiceToken,
} from '@nocobase/app-server/realtime';
import {
  ServiceContainer,
  ServiceProvider,
  ServiceProviderRegistry,
} from '@nocobase/service-provider';
import { createDefaultCachingConfig } from '@nocobase/caching';
import { CachingProvider, cachingToken } from '@nocobase/app-server/caching';
import type { AppConfigAccessor } from '@nocobase/app-server/config';
import { DriveProvider, driveManagerToken } from '@nocobase/app-server/drive';
import {
  IdGeneratorProvider,
  idGeneratorToken,
} from '@nocobase/app-server/id-generator';
import { LoggingProvider, loggingToken } from '@nocobase/app-server/logging';
import {
  QueueServiceProvider,
  queueServiceToken,
} from '@nocobase/app-server/queue';
import {
  SessionProvider,
  sessionManagerToken,
} from '@nocobase/app-server/session';
import { createNullSessionConfig } from '@nocobase/session';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';

describe('app service providers', () => {
  it('registers core services and shuts them down in reverse order', async () => {
    const services = new ServiceContainer();
    const registry = new ServiceProviderRegistry();
    const app = createProviderApplication(
      {
        caching: createDefaultCachingConfig(),
        drive: {
          default: 'local',
          disks: {
            local: {
              driver: 'fs',
              location: process.cwd(),
              visibility: 'private',
            },
          },
        },
        logging: {
          enabled: false,
          level: 'silent',
        },
        queue: { queueBackend: 'inMemory' },
        session: createNullSessionConfig(),
        snowflake: {
          workerId: 0,
        },
      },
      services,
    );
    registry.add(new LoggingProvider(app));
    registry.add(new CachingProvider(app));
    registry.add(new IdGeneratorProvider(app));
    registry.add(new SessionProvider(app));
    registry.add(new DriveProvider(app));
    registry.add(new QueueServiceProvider(app));
    registry.add(new RealtimeProvider(app));

    registry.registerAll();
    const logging = services.resolve(loggingToken);
    const caching = services.resolve(cachingToken);
    const idGenerator = services.resolve(idGeneratorToken);
    const sessionManager = services.resolve(sessionManagerToken);
    const queue = services.resolve(queueServiceToken);
    const realtime = services.resolve(realtimeServiceToken);
    const closeLogging = vi.spyOn(logging, 'close');
    const dispose = vi.spyOn(caching, 'dispose');
    const disposeSession = vi.spyOn(sessionManager, 'dispose');
    const closeQueue = vi.spyOn(queue, 'shutdown');
    const closeRealtime = vi.spyOn(realtime, 'close');

    await registry.shutdown();

    expect(services.resolve(idGeneratorToken)).toBe(idGenerator);
    expect(services.has(driveManagerToken)).toBe(true);
    expect(closeRealtime).toHaveBeenCalledOnce();
    expect(closeQueue).toHaveBeenCalledOnce();
    expect(disposeSession).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(closeLogging).toHaveBeenCalledOnce();
    expect(disposeSession.mock.invocationCallOrder[0]).toBeLessThan(
      dispose.mock.invocationCallOrder[0],
    );
    expect(closeQueue.mock.invocationCallOrder[0]).toBeLessThan(
      disposeSession.mock.invocationCallOrder[0],
    );
    expect(closeRealtime.mock.invocationCallOrder[0]).toBeLessThan(
      closeQueue.mock.invocationCallOrder[0],
    );
    expect(dispose.mock.invocationCallOrder[0]).toBeLessThan(
      closeLogging.mock.invocationCallOrder[0],
    );
  });

  it('registers and prepares drive only when configuration is available', async () => {
    const services = new ServiceContainer();
    const registry = new ServiceProviderRegistry();
    registry.add(
      new DriveProvider({
        config: createTestConfig({
          drive: {
            default: 'public',
            disks: {
              public: {
                driver: 'fs',
                location: process.cwd(),
                visibility: 'public',
              },
            },
          },
        }),
        container: services,
      }),
    );

    registry.registerAll();
    await registry.bootAll();

    expect(services.has(driveManagerToken)).toBe(true);
    expect(services.resolve(driveManagerToken)).toBeDefined();
  });

  it('starts the queue without using the application database', async () => {
    const services = new ServiceContainer();
    const registry = new ServiceProviderRegistry();
    const connection = { kind: 'connection' };
    const database = {
      connection: vi.fn(() => connection),
      destroy: vi.fn(() => Promise.resolve()),
    } as unknown as DatabaseManager;
    const queueConfig = { queueBackend: 'inMemory' };
    const app = createProviderApplication(
      {
        database: createDatabaseConfig(),
        app: {
          name: 'provider-test',
          publicOrigin: 'https://example.com',
          publicBasePath: '/provider-test',
        },
        auth: {
          secret: 'test-auth-secret-at-least-32-characters',
        },
        caching: createDefaultCachingConfig(),
        logging: {
          enabled: false,
          level: 'silent',
        },
        queue: queueConfig,
        snowflake: {
          workerId: 0,
        },
      },
      services,
    );
    services.instance(databaseManagerToken, database);
    registry.add(new LoggingProvider(app));
    registry.add(new CachingProvider(app));
    registry.add(new IdGeneratorProvider(app));
    registry.add(new QueueServiceProvider(app));

    registry.registerAll();
    const queue = services.resolve(queueServiceToken);
    await registry.bootAll();
    await registry.startAll();
    await expect(queue.producer('test').publish('event', {})).resolves.toEqual({
      jobId: expect.any(String),
    });

    expect(database.connection).not.toHaveBeenCalled();
    expect(services.resolve(databaseManagerToken)).toBe(database);
    await registry.shutdown();
  });
});

describe('template queue composition', () => {
  it('registers an app-scoped in-memory queue before plugins and consumes only after boot', async () => {
    const first = await createQueueApplication('first-app');
    const second = await createQueueApplication('second-app');
    try {
      first.app.registerProviders();
      second.app.registerProviders();
      expect(first.registered()).toBe(true);
      expect(second.registered()).toBe(true);
      const firstQueue = first.app.container.resolve(queueServiceToken);
      const secondQueue = second.app.container.resolve(queueServiceToken);
      expect(firstQueue).not.toBe(secondQueue);
      await expect(
        firstQueue.producer('shared').publish('event', 'before'),
      ).rejects.toThrow();
      expect(first.received).toEqual([]);
      await first.app.start();
      await second.app.start();
      expect(first.booted()).toBe(true);
      expect(second.booted()).toBe(true);
      await firstQueue.producer('shared').publish('event', 'first');
      await secondQueue.producer('shared').publish('event', 'second');
      await expect
        .poll(() => [first.received, second.received])
        .toEqual([['first'], ['second']]);
      expect(first.warn).toHaveBeenCalledWith(
        { namespace: 'first-app', queue: 'shared' },
        'Queue is running in memory mode. Jobs will be lost on restart.',
      );
      await first.app.shutdown();
      await secondQueue.producer('shared').publish('event', 'still-running');
      await expect
        .poll(() => second.received)
        .toEqual(['second', 'still-running']);
      expect(first.received).toEqual(['first']);
    } finally {
      await first.app.shutdown();
      await second.app.shutdown();
      vi.restoreAllMocks();
    }
  });
});

async function createQueueApplication(name: string) {
  const received: unknown[] = [];
  let registered = false;
  let booted = false;
  class QueuePluginProvider extends ServiceProvider<Application> {
    public readonly name: string = 'test/queue-plugin';
    private unregister: UnregisterHandler | undefined;

    public override register(): void {
      registered = this.app.container.has(queueServiceToken);
      expect(registered).toBe(true);
    }

    public override async boot(): Promise<void> {
      const queue = this.app.container.resolve(queueServiceToken);
      this.unregister = queue
        .consumer('shared')
        .consume(async (_channel, message) => {
          received.push(message);
        });
      await expect(
        queue.producer('shared').publish('event', 'boot'),
      ).rejects.toThrow();
      expect(received).toEqual([]);
      booted = true;
    }

    public override async shutdown(): Promise<void> {
      await this.unregister?.();
    }
  }
  const runtime = await resolveStandaloneAppRuntime(
    {
      ...appRuntime,
      createAppConfig: () => new AppConfig(),
      defaultConfigs: () => ({
        app: { name, publicBasePath: '', internalBasePath: '' },
        spa: { indexPath: '/missing/index.html' },
        database: { default: 'none', connections: {} },
        drive: {
          default: 'local',
          disks: {
            local: {
              driver: 'fs',
              location: process.cwd(),
              visibility: 'private',
            },
          },
        },
        logging: { enabled: false, level: 'silent' },
        caching: createDefaultCachingConfig(),
        session: createNullSessionConfig(),
        snowflake: { workerId: 0 },
      }),
      plugins: defineServerPlugins([]),
      serviceProviders: [],
      routes: [],
      locales: undefined,
    },
    {
      rootDir: fileURLToPath(new URL('../..', import.meta.url)),
      env: {},
    },
  );
  const app = createApp({
    ...runtime,
    plugins: {
      ...runtime.plugins,
      plugins: [
        {
          definition: defineServerPlugin({
            packageName: '@nocobase/app-plugin-queue-test',
            serviceProviders: [QueuePluginProvider],
          }),
          metadata: {
            packageName: '@nocobase/app-plugin-queue-test',
            version: 'test',
            rootDir: '/test/queue-plugin',
          },
        },
      ],
    },
  });
  // Observe the public warning payload to verify the default namespace without inspecting internals.
  const warn = vi.fn();
  app.addServiceProvider(
    class QueueLoggerProbe extends ServiceProvider<Application> {
      public readonly name: string = 'test/queue-logger';
      public override register(): void {
        const logger = this.app.container.resolve(loggingToken).getLogger();
        vi.spyOn(logger, 'child').mockReturnValue(logger);
        vi.spyOn(logger, 'warn').mockImplementation(warn);
      }
    },
  );
  return {
    app,
    received,
    warn,
    registered: () => registered,
    booted: () => booted,
  };
}

function createProviderApplication(
  values: Readonly<Record<string, unknown>>,
  container: ServiceContainer,
): {
  config: AppConfigAccessor;
  container: ServiceContainer;
  appName: string;
  publicBasePath: string;
  paths: ReturnType<typeof createConfigPaths>;
  router: Hono;
} {
  return {
    config: createTestConfig(values),
    container,
    appName: 'provider-test',
    publicBasePath: '/provider-test',
    paths: createConfigPaths({ rootDir: process.cwd() }),
    router: new Hono(),
  };
}

function createTestConfig(
  values: Readonly<Record<string, unknown>>,
): AppConfigAccessor {
  return {
    get: <TValue>(definition: string): TValue => values[definition] as TValue,
    raw: () => values,
    reload: () => Promise.resolve({ changedNamespaces: [] }),
    subscribe: () => () => undefined,
  };
}

function createDatabaseConfig(): object {
  return {
    default: 'main',
    connections: {},
    migrations: {
      directory: '',
      autoRun: false,
    },
  };
}
