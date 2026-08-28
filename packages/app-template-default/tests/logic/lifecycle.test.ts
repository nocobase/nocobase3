import { describe, expect, it, vi } from 'vitest';

import {
  RealtimeProvider,
  realtimeServiceToken,
} from '@nocobase/app-server-kit/realtime';
import {
  ServiceContainer,
  ServiceProviderRegistry,
} from '@nocobase/service-provider';
import {
  CachingProvider,
  cachingToken,
  createDefaultCachingConfig,
} from '@nocobase/caching';
import { DriveProvider, driveManagerToken } from '@nocobase/drive';
import { IdGeneratorProvider, idGeneratorToken } from '@nocobase/id-generator';
import { LoggingProvider, loggingToken } from '@nocobase/logging';
import { QueueProvider, queueManagerToken } from '@nocobase/queue';
import {
  createNullSessionConfig,
  SessionProvider,
  sessionManagerToken,
} from '@nocobase/session';
import {
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/app-database';
import type { AppConfig } from '../../server/config/index.ts';
import {
  AppSettingsProvider,
  appSettingsRepositoryToken,
  publicFilesRepositoryToken,
  PublicFilesProvider,
} from '../../server/providers/index.ts';
import { DatabaseAppSettingsRepository } from '../../server/repositories/app-settings.ts';
import { DrivePublicFilesRepository } from '../../server/repositories/public-files.ts';

describe('app service providers', () => {
  it('registers core services and shuts them down in reverse order', async () => {
    const services = new ServiceContainer();
    const registry = new ServiceProviderRegistry();
    const app = createProviderApplication(
      {
        caching: createDefaultCachingConfig(),
        logging: {
          enabled: false,
          level: 'silent',
        },
        session: createNullSessionConfig(),
        snowflake: {
          workerId: 0,
        },
      } as AppConfig,
      services,
    );
    registry.add(new LoggingProvider(app));
    registry.add(new CachingProvider(app));
    registry.add(new IdGeneratorProvider(app));
    registry.add(new SessionProvider(app));
    registry.add(new DriveProvider(app));
    registry.add(new QueueProvider(app));
    registry.add(new RealtimeProvider(app));

    registry.registerAll();
    const logging = services.resolve(loggingToken);
    const caching = services.resolve(cachingToken);
    const idGenerator = services.resolve(idGeneratorToken);
    const sessionManager = services.resolve(sessionManagerToken);
    const queueManager = services.resolve(queueManagerToken);
    const realtime = services.resolve(realtimeServiceToken);
    const flush = vi.spyOn(logging, 'flush');
    const dispose = vi.spyOn(caching, 'dispose');
    const disposeSession = vi.spyOn(sessionManager, 'dispose');
    const closeQueue = vi.spyOn(queueManager, 'close');
    const closeRealtime = vi.spyOn(realtime, 'close');

    await registry.shutdown();

    expect(services.resolve(idGeneratorToken)).toBe(idGenerator);
    expect(services.has(driveManagerToken)).toBe(false);
    expect(closeRealtime).toHaveBeenCalledOnce();
    expect(closeQueue).toHaveBeenCalledOnce();
    expect(disposeSession).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledOnce();
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
      flush.mock.invocationCallOrder[0],
    );
  });

  it('registers and prepares drive only when configuration is available', async () => {
    const services = new ServiceContainer();
    const registry = new ServiceProviderRegistry();
    registry.add(
      new DriveProvider({
        config: {
          drive: {
            default: 'public',
            disks: {
              public: {
                driver: 'fs',
                location: process.cwd(),
                visibility: 'public',
              },
            },
            links: {},
          },
        } as AppConfig,
        container: services,
      }),
    );

    registry.registerAll();
    await registry.bootAll();

    expect(services.has(driveManagerToken)).toBe(true);
    expect(services.resolve(driveManagerToken)).toBeDefined();
  });

  it('resolves application repositories from database and drive providers', () => {
    const services = new ServiceContainer();
    const registry = new ServiceProviderRegistry();
    const database = {} as DatabaseManager;
    const app = createProviderApplication(
      {
        database: createDatabaseConfig(),
        drive: {
          default: 'public',
          disks: {
            public: {
              driver: 'fs',
              location: process.cwd(),
              visibility: 'public',
            },
          },
          links: {},
        },
      } as AppConfig,
      services,
    );
    services.instance(databaseManagerToken, database);
    registry.add(new AppSettingsProvider(app));
    registry.add(new DriveProvider(app));
    registry.add(new PublicFilesProvider(app));

    registry.registerAll();

    const appSettings = services.resolve(appSettingsRepositoryToken);
    const publicFiles = services.resolve(publicFilesRepositoryToken);

    expect(appSettings).toBeInstanceOf(DatabaseAppSettingsRepository);
    expect(publicFiles).toBeInstanceOf(DrivePublicFilesRepository);
  });

  it('preserves unavailable application repositories without infrastructure', async () => {
    const services = new ServiceContainer();
    const registry = new ServiceProviderRegistry();
    const app = createProviderApplication({} as AppConfig, services);
    registry.add(new AppSettingsProvider(app));
    registry.add(new PublicFilesProvider(app));

    registry.registerAll();

    await expect(
      services.resolve(appSettingsRepositoryToken).all(),
    ).rejects.toThrow('Database is not configured.');
    await expect(
      services.resolve(publicFilesRepositoryToken).upload(undefined),
    ).rejects.toThrow('File drive is not configured.');
  });

  it('reports a missing public upload disk', async () => {
    const services = new ServiceContainer();
    const registry = new ServiceProviderRegistry();
    const app = createProviderApplication(
      {
        drive: {
          default: 'private',
          disks: {
            private: {
              driver: 'fs',
              location: process.cwd(),
              visibility: 'private',
            },
          },
          links: {},
        },
      } as AppConfig,
      services,
    );
    registry.add(new DriveProvider(app));
    registry.add(new PublicFilesProvider(app));

    registry.registerAll();

    await expect(
      services.resolve(publicFilesRepositoryToken).upload(undefined),
    ).rejects.toThrow('Upload drive disk "public" is not configured.');
  });

  it('resolves authentication, authorization, and queue provider dependencies', async () => {
    const services = new ServiceContainer();
    const registry = new ServiceProviderRegistry();
    const connection = { kind: 'connection' };
    const database = {
      connection: vi.fn(() => connection),
      destroy: vi.fn(() => Promise.resolve()),
    } as unknown as DatabaseManager;
    const queueConfig = {
      default: 'test',
      connections: {
        test: { driver: 'fake' as const },
      },
    };
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
      } as AppConfig,
      services,
    );
    services.instance(databaseManagerToken, database);
    registry.add(new LoggingProvider(app));
    registry.add(new CachingProvider(app));
    registry.add(new IdGeneratorProvider(app));
    registry.add(new QueueProvider(app));

    registry.registerAll();
    services.resolve(queueManagerToken);

    expect(services.resolve(databaseManagerToken)).toBe(database);
    await registry.shutdown();
  });
});

function createProviderApplication(
  config: AppConfig,
  container: ServiceContainer,
): {
  config: AppConfig;
  container: ServiceContainer;
} {
  return {
    config,
    container,
  };
}

function createDatabaseConfig(): AppConfig['database'] {
  return {
    default: 'main',
    connections: {},
    migrations: {
      directory: '',
      autoRun: false,
    },
  };
}
