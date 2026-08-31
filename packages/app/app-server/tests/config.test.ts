import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createDatabaseMigratorMock = vi.hoisted(() => vi.fn());
const createDatabaseSeederMock = vi.hoisted(() => vi.fn());
const tempDirs: string[] = [];

vi.mock('@nocobase/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/db')>();

  return {
    ...actual,
    createMigrator: createDatabaseMigratorMock,
    createSeeder: createDatabaseSeederMock,
  };
});

import {
  createAppDatabaseManager,
  createAppMigrator,
  createAppSeeder,
  createConfigPaths,
  prepareAppDatabaseStorage,
  type AppDatabaseConfig,
} from '../src/index.js';

beforeEach(() => {
  createDatabaseMigratorMock.mockReset();
  createDatabaseSeederMock.mockReset();
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('app-server config runtime', () => {
  it('supports custom database runtime paths', () => {
    const paths = createConfigPaths({
      rootDir: '/tmp/app',
      databaseDir: '/tmp/app/dist/database',
    });

    expect(paths.database('migrations')).toBe(
      '/tmp/app/dist/database/migrations',
    );
  });
});

describe('app database manager', () => {
  it('skips manager creation for the none connection', () => {
    const config: AppDatabaseConfig = {
      default: 'none',
      connections: {},
      migrations: {
        directory: '/tmp/app/database/migrations',
        autoRun: false,
      },
    };

    expect(createAppDatabaseManager(config)).toBeUndefined();
  });

  it('creates a lazy database manager for configured connections', () => {
    const config: AppDatabaseConfig = {
      default: 'sqlite',
      connections: {
        sqlite: {
          dialect: 'sqlite',
          filename: '/tmp/app/storage/database.sqlite',
        },
      },
      migrations: {
        directory: '/tmp/app/database/migrations',
        autoRun: false,
      },
    };

    expect(createAppDatabaseManager(config)).toBeDefined();
  });
});

describe('app database storage', () => {
  it('creates the active sqlite database parent directory', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-app-storage-'));
    tempDirs.push(root);
    const filename = path.join(root, 'storage', 'database.sqlite');

    await prepareAppDatabaseStorage({
      default: 'sqlite',
      connections: {
        sqlite: {
          dialect: 'sqlite',
          filename,
        },
      },
      migrations: {
        directory: path.join(root, 'database', 'migrations'),
        autoRun: false,
      },
    });

    expect(existsSync(path.dirname(filename))).toBe(true);
  });
});

describe('app migrator', () => {
  it('skips missing migration directories', async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-missing-migrations-'),
    );
    const migrator = createAppMigrator({
      database: createMockDatabaseManager(),
      config: {
        directory: path.join(root, 'migrations'),
        autoRun: true,
      },
    });

    await expect(migrator.latest()).resolves.toEqual({
      status: 'skipped',
      reason: 'missing-directory',
    });
  });

  it('runs migrations from the configured directory', async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-migrations-'),
    );
    const latest = vi.fn().mockResolvedValue({
      batch: 2,
      executed: ['001_create_users'],
      skipped: ['000_create_accounts'],
    });
    const rollback = vi.fn();
    createDatabaseMigratorMock.mockReturnValue({ latest, rollback });
    const database = createMockDatabaseManager();
    const migrator = createAppMigrator({
      database,
      config: {
        directory,
        autoRun: true,
        tableName: 'app_migrations',
        lockTableName: 'app_migration_lock',
        extensions: ['.js', '.mjs'],
      },
    });

    await expect(migrator.latest()).resolves.toEqual({
      status: 'completed',
      batch: 2,
      executed: ['001_create_users'],
      skipped: ['000_create_accounts'],
    });
    expect(createDatabaseMigratorMock).toHaveBeenCalledWith({
      database,
      connection: undefined,
      directory,
      packageName: undefined,
      tableName: 'app_migrations',
      lockTableName: 'app_migration_lock',
      extensions: ['.js', '.mjs'],
    });
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('rolls back migrations from the configured directory', async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-migrations-'),
    );
    const latest = vi.fn();
    const rollback = vi.fn().mockResolvedValue({
      batch: 2,
      rolledBack: ['001_create_users'],
    });
    createDatabaseMigratorMock.mockReturnValue({ latest, rollback });
    const migrator = createAppMigrator({
      database: createMockDatabaseManager(),
      config: {
        directory,
        autoRun: true,
      },
      connection: 'tenant',
    });

    await expect(migrator.rollback()).resolves.toEqual({
      status: 'completed',
      batch: 2,
      rolledBack: ['001_create_users'],
    });
    expect(createDatabaseMigratorMock).toHaveBeenCalledWith({
      database: expect.any(Object),
      connection: 'tenant',
      directory,
      packageName: undefined,
      tableName: undefined,
      lockTableName: undefined,
      extensions: undefined,
    });
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it('runs migrations from package sources', async () => {
    const firstDirectory = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-migration-source-'),
    );
    const secondDirectory = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-migration-source-'),
    );
    tempDirs.push(firstDirectory, secondDirectory);
    const latest = vi.fn().mockResolvedValue({
      batch: 1,
      executed: [],
      skipped: [],
    });
    createDatabaseMigratorMock.mockReturnValue({ latest, rollback: vi.fn() });
    const sources = [
      { packageName: '@nocobase/app', directory: firstDirectory },
      {
        packageName: '@nocobase/app-plugin-example',
        directory: secondDirectory,
      },
    ];
    const database = createMockDatabaseManager();
    const migrator = createAppMigrator({
      database,
      config: {
        directory: '/unused',
        autoRun: true,
      },
      sources,
    });

    await expect(migrator.latest()).resolves.toMatchObject({
      status: 'completed',
    });
    expect(createDatabaseMigratorMock).toHaveBeenCalledWith({
      database,
      connection: undefined,
      sources,
      tableName: undefined,
      lockTableName: undefined,
      extensions: undefined,
    });
  });
});

describe('app seeder', () => {
  it('skips missing seed directories', async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-missing-seeds-'),
    );
    tempDirs.push(root);
    const seeder = createAppSeeder({
      database: createMockDatabaseManager(),
      config: {
        directory: path.join(root, 'seeds'),
        autoRun: true,
      },
    });

    await expect(seeder.run()).resolves.toEqual({
      status: 'skipped',
      reason: 'missing-directory',
    });
    expect(createDatabaseSeederMock).not.toHaveBeenCalled();
  });

  it('runs seeds from the configured directory', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nocobase-app-seeds-'));
    tempDirs.push(directory);
    const run = vi.fn().mockResolvedValue({
      executed: ['001_create_admin'],
      skipped: ['000_create_roles'],
    });
    createDatabaseSeederMock.mockReturnValue({ run });
    const database = createMockDatabaseManager();
    const seeder = createAppSeeder({
      database,
      config: {
        directory,
        packageName: '@nocobase/app',
        autoRun: true,
        tableName: 'app_seeds',
        lockTableName: 'app_seed_lock',
        extensions: ['.js', '.mjs'],
      },
      connection: 'tenant',
    });

    await expect(seeder.run()).resolves.toEqual({
      status: 'completed',
      executed: ['001_create_admin'],
      skipped: ['000_create_roles'],
    });
    expect(createDatabaseSeederMock).toHaveBeenCalledWith({
      database,
      connection: 'tenant',
      directory,
      packageName: '@nocobase/app',
      tableName: 'app_seeds',
      lockTableName: 'app_seed_lock',
      extensions: ['.js', '.mjs'],
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs seeds from enabled package sources', async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-seed-source-'),
    );
    tempDirs.push(directory);
    const run = vi.fn().mockResolvedValue({ executed: [], skipped: [] });
    createDatabaseSeederMock.mockReturnValue({ run });
    const sources = [
      { packageName: '@nocobase/app-plugin-example', directory },
    ];
    const database = createMockDatabaseManager();
    const seeder = createAppSeeder({
      database,
      config: {
        directory: '/unused',
        autoRun: true,
      },
      sources,
    });

    await expect(seeder.run()).resolves.toMatchObject({ status: 'completed' });
    expect(createDatabaseSeederMock).toHaveBeenCalledWith({
      database,
      connection: undefined,
      sources,
      tableName: undefined,
      lockTableName: undefined,
      extensions: undefined,
    });
  });
});

function createMockDatabaseManager(client: unknown = {}): DatabaseManager {
  return {
    connection: vi.fn().mockReturnValue({
      client: vi.fn().mockResolvedValue(client),
    }) as DatabaseManager['connection'],
    builder: vi.fn() as DatabaseManager['builder'],
    query: vi.fn() as DatabaseManager['query'],
    connect: vi.fn() as DatabaseManager['connect'],
    transaction: vi.fn() as DatabaseManager['transaction'],
    disconnect: vi.fn() as DatabaseManager['disconnect'],
    reconnect: vi.fn() as DatabaseManager['reconnect'],
    destroy: vi.fn() as DatabaseManager['destroy'],
  };
}
