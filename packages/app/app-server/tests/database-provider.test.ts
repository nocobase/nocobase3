import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AppConfig, createConfigPaths } from '../src/config/index.js';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  ServiceContainer,
  ServiceProviderRegistry,
} from '@nocobase/service-provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createDatabaseManagerMock = vi.hoisted(() => vi.fn());
const createDatabaseMigratorMock = vi.hoisted(() => vi.fn());
const createDatabaseSeederMock = vi.hoisted(() => vi.fn());

vi.mock('@nocobase/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/db')>();

  return {
    ...actual,
    createDatabaseManager: createDatabaseManagerMock,
    createMigrator: createDatabaseMigratorMock,
    createSeeder: createDatabaseSeederMock,
  };
});

import {
  DatabaseProvider,
  databaseConfig,
  runAppMigrations,
  runAppSeeds,
  type AppDatabaseConfig,
  type DatabaseProviderApplication,
} from '../src/database/index.js';
import type { ResolvedAppRuntimeConfigContext } from '../src/runtime/index.js';

const tempDirs: string[] = [];

beforeEach(() => {
  createDatabaseManagerMock.mockReset();
  createDatabaseMigratorMock.mockReset();
  createDatabaseSeederMock.mockReset();
});

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('DatabaseProvider', () => {
  it('registers a lazy database manager created from runtime config', async () => {
    const database = createMockDatabase();
    createDatabaseManagerMock.mockReturnValue(database);
    const { provider, container } = await createProvider(createConfig());

    provider.register();

    expect(provider.name).toBe('@nocobase/app-server/database');
    expect(container.resolveIfCreated(databaseManagerToken)).toBeUndefined();
    expect(container.resolve(databaseManagerToken)).toBe(database);
    expect(createDatabaseManagerMock).toHaveBeenCalledOnce();
  });

  it('does not register a database when the default connection is none', async () => {
    const { provider, container } = await createProvider({
      ...createConfig(),
      default: 'none',
      connections: {},
    });

    provider.register();

    expect(container.has(databaseManagerToken)).toBe(false);
  });

  it('prepares storage, runs migrations before seeds, and destroys the database', async () => {
    const calls: string[] = [];
    const root = createTempDirectory();
    const database = createMockDatabase(() => calls.push('destroy'));
    createDatabaseManagerMock.mockReturnValue(database);
    createDatabaseMigratorMock.mockReturnValue({
      latest: vi.fn(async () => {
        calls.push('migrate');
        return { batch: 1, executed: [], skipped: [] };
      }),
      rollback: vi.fn(),
    });
    createDatabaseSeederMock.mockReturnValue({
      run: vi.fn(async () => {
        calls.push('seed');
        return { executed: [], skipped: [] };
      }),
    });
    const config = createConfig(root, true);
    const { provider, container } = await createProvider(config);
    const registry = new ServiceProviderRegistry();
    registry.add(provider);
    registry.registerAll();

    await registry.bootAll();
    await registry.shutdown();

    expect(existsSync(path.dirname(config.connections.main.filename))).toBe(
      true,
    );
    expect(calls).toEqual(['migrate', 'seed', 'destroy']);
    expect(container.resolveIfCreated(databaseManagerToken)).toBe(database);
  });

  it('does not run automatic tasks when autoRun is disabled', async () => {
    const database = createMockDatabase();
    createDatabaseManagerMock.mockReturnValue(database);
    const { provider } = await createProvider(createConfig());

    provider.register();
    await provider.boot();
    await provider.shutdown();

    expect(createDatabaseMigratorMock).not.toHaveBeenCalled();
    expect(createDatabaseSeederMock).not.toHaveBeenCalled();
    expect(database.destroy).toHaveBeenCalledOnce();
  });

  it('stops before seeds and destroys the database when migrations fail', async () => {
    const error = new Error('migration failed');
    const database = createMockDatabase();
    createDatabaseManagerMock.mockReturnValue(database);
    createDatabaseMigratorMock.mockReturnValue({
      latest: vi.fn().mockRejectedValue(error),
      rollback: vi.fn(),
    });
    const { provider } = await createProvider(
      createConfig(createTempDirectory(), true),
    );
    const registry = new ServiceProviderRegistry();
    registry.add(provider);
    registry.registerAll();

    await expect(registry.bootAll()).rejects.toBe(error);

    expect(createDatabaseSeederMock).not.toHaveBeenCalled();
    expect(database.destroy).toHaveBeenCalledOnce();
  });
});

describe('database config', () => {
  it('defaults to managed schema ownership and accepts the external env override', async () => {
    const paths = createConfigPaths({ rootDir: process.cwd() });
    const context = {
      paths,
      plugins: { appPackageName: 'test-app', plugins: [] },
      appPackageName: 'test-app',
    } as ResolvedAppRuntimeConfigContext;
    const defaults = new AppConfig([databaseConfig], { context });
    const external = new AppConfig([databaseConfig], {
      context,
      environment: { DB_SCHEMA_MANAGEMENT: 'external' },
    });

    await defaults.loadAll();
    await external.loadAll();

    expect(defaults.get(databaseConfig).connections.main.schemaManagement).toBe(
      'managed',
    );
    expect(external.get(databaseConfig).connections.main.schemaManagement).toBe(
      'external',
    );
  });
});

describe('standalone database tasks', () => {
  it('runs manual migrations and always destroys their database', async () => {
    const error = new Error('migration failed');
    const database = createMockDatabase();
    createDatabaseManagerMock.mockReturnValue(database);
    createDatabaseMigratorMock.mockReturnValue({
      latest: vi.fn().mockRejectedValue(error),
      rollback: vi.fn(),
    });

    await expect(
      runAppMigrations(createConfig(createTempDirectory())),
    ).rejects.toBe(error);
    expect(database.destroy).toHaveBeenCalledOnce();
  });

  it('runs manual seeds even when autoRun is disabled', async () => {
    const database = createMockDatabase();
    createDatabaseManagerMock.mockReturnValue(database);
    createDatabaseSeederMock.mockReturnValue({
      run: vi.fn().mockResolvedValue({ executed: ['seed'], skipped: [] }),
    });

    await expect(
      runAppSeeds(createConfig(createTempDirectory())),
    ).resolves.toEqual({
      status: 'completed',
      executed: ['seed'],
      skipped: [],
    });
    expect(database.destroy).toHaveBeenCalledOnce();
  });

  it('returns undefined when the requested database service is unavailable', async () => {
    const config = {
      ...createConfig(),
      default: 'none' as const,
      connections: {},
    };

    await expect(runAppMigrations(config)).resolves.toBeUndefined();
    await expect(
      runAppSeeds({ ...config, seeds: undefined }),
    ).resolves.toBeUndefined();
  });
});

async function createProvider(database: AppDatabaseConfig): Promise<{
  readonly provider: DatabaseProvider<DatabaseProviderApplication>;
  readonly container: ServiceContainer;
}> {
  const container = new ServiceContainer();
  const appConfig = new AppConfig([{ ...databaseConfig, defaults: database }], {
    context: {},
  });
  await appConfig.loadAll();
  const app: DatabaseProviderApplication = {
    config: appConfig,
    container,
  };
  return {
    provider: new DatabaseProvider(app),
    container,
  };
}

function createConfig(
  root: string = '/tmp/nocobase-app-server',
  autoRun: boolean = false,
): AppDatabaseConfig & {
  connections: {
    main: { dialect: 'sqlite'; filename: string };
  };
} {
  return {
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(root, 'storage', 'database.sqlite'),
      },
    },
    migrations: {
      directory: root,
      autoRun,
    },
    seeds: {
      directory: root,
      autoRun,
    },
  };
}

function createTempDirectory(): string {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'nocobase-database-provider-'),
  );
  tempDirs.push(directory);
  return directory;
}

function createMockDatabase(onDestroy?: () => void): DatabaseManager {
  return {
    connection: vi.fn() as DatabaseManager['connection'],
    builder: vi.fn() as DatabaseManager['builder'],
    query: vi.fn() as DatabaseManager['query'],
    connect: vi.fn() as DatabaseManager['connect'],
    transaction: vi.fn() as DatabaseManager['transaction'],
    disconnect: vi.fn() as DatabaseManager['disconnect'],
    reconnect: vi.fn() as DatabaseManager['reconnect'],
    destroy: vi.fn(async () => {
      onDestroy?.();
    }),
  };
}
