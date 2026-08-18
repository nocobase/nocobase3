// @vitest-environment node

import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateMigrations } from '@nocobase/database';
import { afterEach, describe, expect, it } from 'vitest';

import { createConfigEnv, createConfigPaths, loadConfig } from '@nocobase/app-server/config';

import app from '../../server/config/app.ts';
import configFactories from '../../server/config/index.ts';
import database from '../../server/config/database.ts';
import server from '../../server/config/server.ts';
import spa from '../../server/config/spa.ts';
import { createStandaloneRuntime } from '../../server/index.ts';
import { loadEmbeddedAppConfig } from '../../server/runtime/config.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('template config registry', () => {
  it('loads every registered config section', () => {
    const config = loadConfig(configFactories, {
      env: createConfigEnv({}),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.app.name).toBe('app-template-default');
    expect(config.database.default).toBe('sqlite');
    expect(config.server.host).toBe('127.0.0.1');
    expect(config.spa.indexPath).toBe('/tmp/app-template-default/dist/client/index.html');
  });
});

describe('app config', () => {
  it('declares standalone routing defaults', () => {
    const config = app({
      env: createConfigEnv({
        APP_BASE_PATH: '/main',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config).toMatchObject({
      name: 'main',
      publicBasePath: '/main',
      internalBasePath: '',
      internalApiProxyPath: '/v2/api',
      publicApiUrl: '/main/v2/api',
    });
  });

  it('derives nested standalone routing from the public base path', () => {
    const config = app({
      env: createConfigEnv({
        APP_BASE_PATH: '/main/test',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config).toMatchObject({
      name: 'test',
      publicBasePath: '/main/test',
      internalBasePath: '',
      internalApiProxyPath: '/v2/api',
      publicApiUrl: '/main/test/v2/api',
    });
  });

  it('resolves embedded routing from the app-host scope', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-app-template-default-embedded-config-'));
    const dataDir = path.join(root, 'data');
    const clientDir = path.join(root, 'dist/client');
    tempDirs.push(root);

    const config = loadEmbeddedAppConfig(
      {
        id: 'main',
        appName: 'main-app',
        basePath: '/main',
        rootDir: root,
        clientDir,
        dataDir,
      },
      new URL('../../server/embedded.ts', import.meta.url).href,
    );

    expect(config.app).toMatchObject({
      name: 'main-app',
      publicBasePath: '/main',
      internalBasePath: '',
      internalApiProxyPath: '/v2/api',
      publicApiUrl: '/main/v2/api',
    });
    expect(config.spa.indexPath).toBe(path.join(clientDir, 'index.html'));
    expect(config.database.connections.sqlite).toMatchObject({
      filename: path.join(dataDir, 'database.sqlite'),
    });
  });
});

describe('spa config', () => {
  it('declares SPA index and runtime defaults', () => {
    const config = spa({
      env: createConfigEnv({}),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config).toEqual({
      indexPath: '/tmp/app-template-default/dist/client/index.html',
      runtime: {
        storagePrefix: 'NOCOBASE_',
        storageType: 'localStorage',
        shareToken: false,
      },
    });
  });

  it('uses the copied client index when config root is a deployment dist root', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-app-template-default-dist-root-'));
    tempDirs.push(root);
    mkdirSync(path.join(root, 'client'), { recursive: true });
    writeFileSync(path.join(root, 'client', 'index.html'), '<div id="root"></div>');

    const config = spa({
      env: createConfigEnv({}),
      paths: createConfigPaths({
        rootDir: root,
      }),
    });

    expect(config.indexPath).toBe(path.join(root, 'client/index.html'));
  });
});

describe('server config', () => {
  it('declares standalone host, port, logging, and Vite dev URL', () => {
    const config = server({
      env: createConfigEnv({
        APP_SERVER_HOST: '0.0.0.0',
        APP_SERVER_PORT: '15000',
        APP_SERVER_START_LOG: 'false',
        APP_VITE_DEV_HOST: '127.0.0.1',
        APP_VITE_DEV_PORT: '5174',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(15000);
    expect(config.startLog).toBe(false);
    expect(config.viteDevUrl?.toString()).toBe('http://127.0.0.1:5174/');
  });
});

describe('database config', () => {
  it('declares sqlite defaults with migrations', () => {
    const config = database({
      env: createConfigEnv({}),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.default).toBe('sqlite');
    expect(config.connections.sqlite).toMatchObject({
      dialect: 'sqlite',
      filename: '/tmp/app-template-default/storage/database.sqlite',
      debug: false,
    });
    expect(config.migrations).toEqual({
      directory: '/tmp/app-template-default/server/migrations',
      autoRun: false,
      tableName: undefined,
      lockTableName: undefined,
    });
  });

  it('maps postgres env values into a named connection', () => {
    const config = database({
      env: createConfigEnv({
        DB_CONNECTION: 'postgres',
        DB_HOST: 'db.internal',
        DB_PORT: '15432',
        DB_DATABASE: 'orders',
        DB_USERNAME: 'orders_user',
        DB_PASSWORD: 'secret',
        DB_SCHEMA: 'public,tenant',
        DB_DEBUG: 'true',
        DB_MIGRATIONS_AUTO_RUN: 'true',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.default).toBe('postgres');
    expect(config.connections.postgres).toMatchObject({
      dialect: 'postgres',
      host: 'db.internal',
      port: 15432,
      database: 'orders',
      username: 'orders_user',
      password: 'secret',
      ssl: false,
      schema: ['public', 'tenant'],
      debug: true,
    });
    expect(config.migrations.autoRun).toBe(true);
  });

  it('does not consume database URL env values as connection config', () => {
    const config = database({
      env: createConfigEnv({
        DB_CONNECTION: 'postgres',
        DB_URL: 'postgres://orders:secret@db.internal:5432/orders',
        DATABASE_URL: 'postgres://orders:secret@other.internal:5432/orders',
        DB_SCHEMA: 'public,tenant',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.connections.postgres).toMatchObject({
      dialect: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      database: 'app',
      username: 'postgres',
      password: '',
      ssl: false,
      schema: ['public', 'tenant'],
    });
    expect(config.connections.postgres).not.toHaveProperty('url');
  });
});

describe('database migrations', () => {
  it('loads template migration files with the current definition format', async () => {
    const directory = fileURLToPath(new URL('../../server/migrations', import.meta.url));

    await expect(validateMigrations(directory)).resolves.toEqual([
      expect.objectContaining({
        name: '202608180001_create_app_settings_table',
        fileName: '202608180001_create_app_settings_table.ts',
      }),
    ]);
  });
});

describe('standalone runtime database config', () => {
  it('uses the active server directory for migrations', () => {
    const runtime = createStandaloneRuntime();

    expect(runtime.config.database.migrations.directory).toMatch(/server\/migrations$/);
  });
});
