import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/app-database';
import {
  ServiceContainer,
  ServiceProviderRegistry,
} from '@nocobase/service-provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createDatabaseManagerMock = vi.hoisted(() => vi.fn());
const createDatabaseMigratorMock = vi.hoisted(() => vi.fn());
const createDatabaseSeederMock = vi.hoisted(() => vi.fn());

vi.mock('@nocobase/app-database', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@nocobase/app-database')>();

  return {
    ...actual,
    createDatabaseManager: createDatabaseManagerMock,
    createMigrator: createDatabaseMigratorMock,
    createSeeder: createDatabaseSeederMock,
  };
});

import {
  DatabaseProvider,
  runAppMigrations,
  runAppSeeds,
  type AppDatabaseConfig,
  type DatabaseProviderApplication,
} from '../src/database/index.js';

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
  it('registers a lazy database manager created from runtime config', () => {
    const database = createMockDatabase();
    createDatabaseManagerMock.mockReturnValue(database);
    const { provider, container } = createProvider(createConfig());

    provider.register();

    expect(provider.name).toBe('@nocobase/app-server-kit/database');
    expect(container.resolveIfCreated(databaseManagerToken)).toBeUndefined();
    expect(container.resolve(databaseManagerToken)).toBe(database);
    expect(createDatabaseManagerMock).toHaveBeenCalledOnce();
  });

  it('does not register a database when the default connection is none', () => {
    const { provider, container } = createProvider({
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
    const { provider, container } = createProvider(config);
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
    const { provider } = createProvider(createConfig());

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
    const { provider } = createProvider(
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

function createProvider(database: AppDatabaseConfig): {
  readonly provider: DatabaseProvider<DatabaseProviderApplication>;
  readonly container: ServiceContainer;
} {
  const container = new ServiceContainer();
  const app: DatabaseProviderApplication = {
    config: { database },
    container,
  };
  return {
    provider: new DatabaseProvider(app),
    container,
  };
}

function createConfig(
  root: string = '/tmp/nocobase-app-server-kit',
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
