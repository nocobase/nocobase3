// @vitest-environment node

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateMigrations, validateSeeds } from '@nocobase/app-database';
import { SNOWFLAKE_EPOCH_SECONDS } from '@nocobase/id-generator';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createConfigEnv,
  createConfigPaths,
  loadConfig,
} from '@nocobase/app-server-kit/config';
import {
  resolveStandaloneAppRuntime,
  resolveStandaloneAppRuntimeConfigSection,
  type CreateStandaloneRuntimeScopeOptions,
} from '@nocobase/app-server-kit/node';
import {
  resolveAppRuntime,
  resolveAppRuntimeConfigSection,
  type AppScope,
  type ResolvedAppScopeRuntime,
} from '@nocobase/app-server-kit/runtime';

import app, { resolvePublicOrigin } from '../../server/config/app.ts';
import auth, { resolveAuthSecret } from '../../server/config/auth.ts';
import caching from '../../server/config/caching.ts';
import configFactories from '../../server/config/index.ts';
import database from '../../server/config/database.ts';
import drive from '../../server/config/drive.ts';
import logging from '../../server/config/logging.ts';
import queue from '../../server/config/queue.ts';
import server from '../../server/config/server.ts';
import snowflake from '../../server/config/snowflake.ts';
import spa from '../../server/config/spa.ts';
import type { DefaultAppScopeConfig } from '../../server/config/types.ts';
import appRuntime from '../../server/runtime.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const requirePackage = createRequire(import.meta.url);
const templateRootDir = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Reads a plugin's declared version rather than repeating it as a literal.
 *
 * The assertions below check that plugin resolution reports the version the package actually declares. Hard-coding it
 * restates the same value in two places, so every version bump breaks the test for a reason that has nothing to do
 * with the resolution logic it covers.
 */
const declaredVersion = (packageName: string): string =>
  (requirePackage(`${packageName}/package.json`) as { version: string })
    .version;

const tempDirs: string[] = [];

const resolveStandaloneConfig = (
  options: CreateStandaloneRuntimeScopeOptions<DefaultAppScopeConfig>,
) => resolveStandaloneAppRuntime(appRuntime, options).config;

const resolveEmbeddedConfig = (scope: AppScope<DefaultAppScopeConfig>) =>
  resolveAppRuntime(appRuntime, scope).config;

const resolveDatabaseTask = (options: ResolvedAppScopeRuntime) => {
  const resolved = resolveAppRuntimeConfigSection(
    appRuntime,
    {
      mode: options.mode,
      id: options.routing.name,
      appName: options.routing.name,
      basePath: options.routing.publicBasePath,
      paths: options.paths,
      env: options.env,
      registerDisposer(): void {},
    },
    'database',
  );
  return {
    database: resolved.config,
    plugins: resolved.plugins.plugins.map((plugin) => plugin.metadata),
  };
};

const resolveStandaloneDatabaseTask = (
  options: CreateStandaloneRuntimeScopeOptions<DefaultAppScopeConfig>,
) => {
  const resolved = resolveStandaloneAppRuntimeConfigSection(
    appRuntime,
    options,
    'database',
  );
  return {
    database: resolved.config,
    plugins: resolved.plugins.plugins.map((plugin) => plugin.metadata),
  };
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('config registry', () => {
  it('loads every registered config section', () => {
    const config = loadConfig(configFactories, {
      env: createConfigEnv({
        AUTH_SECRET: 'test-auth-secret-at-least-32-characters',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.app.name).toBe('main');
    expect(config.auth.emailAndPassword).toMatchObject({
      enabled: true,
      autoSignIn: false,
    });
    expect(config.auth.session).toMatchObject({
      storeSessionInDatabase: true,
    });
    expect(config.caching.default).toBe('memory');
    expect(config.database.default).toBe('main');
    expect(config.drive.default).toBe('local');
    expect(config.logging.default).toBe('system');
    expect(config.queue.default).toBe('sync');
    expect(config.server.host).toBe('127.0.0.1');
    expect(config.snowflake).toEqual({
      workerId: 0,
      epoch: SNOWFLAKE_EPOCH_SECONDS,
    });
    expect(config.spa.indexPath).toBe(
      '/tmp/app-template-default/dist/client/index.html',
    );
  });
});

describe('snowflake config', () => {
  it('declares the default worker ID and epoch', () => {
    const config = snowflake({
      env: createConfigEnv({}),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config).toEqual({
      workerId: 0,
      epoch: SNOWFLAKE_EPOCH_SECONDS,
    });
  });

  it('maps Snowflake environment values', () => {
    const config = snowflake({
      env: createConfigEnv({
        SNOWFLAKE_WORKER_ID: '7',
        SNOWFLAKE_EPOCH: '1700000000',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config).toEqual({
      workerId: 7,
      epoch: 1_700_000_000,
    });
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
      publicOrigin: undefined,
      publicBasePath: '/main',
      internalBasePath: '',
      publicApiUrl: '/main/api',
    });
  });

  it('normalizes the configured public origin', () => {
    const config = app({
      env: createConfigEnv({
        APP_BASE_PATH: '/main',
        APP_PUBLIC_ORIGIN: ' https://apps.example.com/ ',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.publicOrigin).toBe('https://apps.example.com');
  });

  it.each([
    'apps.example.com',
    'ftp://apps.example.com',
    'https://user:password@apps.example.com',
    'https://apps.example.com/main',
    'https://apps.example.com?tenant=main',
    'https://apps.example.com/#main',
  ])('rejects invalid public origin %s', (value) => {
    expect(() => resolvePublicOrigin(value)).toThrow(/APP_PUBLIC_ORIGIN/);
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
      publicApiUrl: '/main/test/api',
    });
  });

  it('resolves embedded routing from the app-host scope', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-embedded-config-'),
    );
    const dataDir = path.join(root, 'data');
    const clientDir = path.join(root, 'dist/client');
    tempDirs.push(root);

    const config = resolveEmbeddedConfig({
      id: 'main',
      appName: 'main-app',
      basePath: '/main',
      rootDir: root,
      clientDir,
      dataDir,
      config: {
        authSecret: 'test-auth-secret-at-least-32-characters',
        publicOrigin: 'https://apps.example.com',
      },
      env: {
        APP_VITE_DEV_URL: 'http://127.0.0.1:5174',
      },
      registerDisposer() {},
    });

    expect(config.app).toMatchObject({
      name: 'main-app',
      publicOrigin: 'https://apps.example.com',
      publicBasePath: '/main',
      internalBasePath: '',
      publicApiUrl: '/main/api',
    });
    expect(config.spa.indexPath).toBe(path.join(clientDir, 'index.html'));
    expect(config.server.viteDevUrl?.toString()).toBe('http://127.0.0.1:5174/');
    expect(config.spa.handler).toBeUndefined();
    expect(config.spa.runtimeGlobals).toEqual({
      NOCOBASE_PORTAL_BASE: '/main/',
      NOCOBASE_API_URL: '/main/api',
      __nocobase_api_client_storage_prefix__: 'NOCOBASE_',
      __nocobase_api_client_storage_type__: 'localStorage',
      __nocobase_api_client_share_token__: false,
    });
    expect(config.caching.providers.memory).toMatchObject({
      driver: 'memory',
    });
    expect(config.database.connections.main).toMatchObject({
      filename: path.join(dataDir, 'database.sqlite'),
    });
    expect(config.database.migrations.directory).toBe(
      path.join(root, 'dist', 'database', 'migrations'),
    );
    expect(config.database.seeds?.directory).toBe(
      path.join(root, 'dist', 'database', 'seeds'),
    );
    expect(config.drive.disks.local).toMatchObject({
      location: path.join(dataDir, 'app/private'),
    });
    expect(config.drive.links).toEqual({
      [path.join(root, 'public/storage')]: path.join(dataDir, 'app/public'),
    });
    expect(config.logging).toMatchObject({
      default: 'system',
      name: 'app-template-default',
    });
    expect(config.queue.jobs?.locations).toEqual(
      expect.arrayContaining([
        path.join(root, 'dist/server/jobs/**/*.{ts,js}'),
        expect.stringMatching(
          /app-plugin-queue-example\/server\/jobs\/\*\*\/\*\.\{ts,js,mts,mjs\}$/,
        ),
      ]),
    );
  });

  it('resolves standalone SPA runtime behavior while loading config', () => {
    const config = resolveStandaloneConfig({
      rootDir: templateRootDir,
      basePath: '/main/test',
      env: { APP_VITE_DEV_URL: 'http://127.0.0.1:5174' },
    });

    expect(config.spa.handler).toEqual(expect.any(Function));
    expect(config.spa.runtimeGlobals).toEqual({
      NOCOBASE_PORTAL_BASE: '/main/test/',
      NOCOBASE_API_URL: '/main/test/api',
      __nocobase_api_client_storage_prefix__: 'NOCOBASE_',
      __nocobase_api_client_storage_type__: 'localStorage',
      __nocobase_api_client_share_token__: false,
    });
  });

  it('requires application scopes to provide resolved path ownership', () => {
    expect(() =>
      resolveEmbeddedConfig({
        id: 'missing-paths',
        basePath: '/missing-paths',
        registerDisposer() {},
      }),
    ).toThrow(/scope\.rootDir or scope\.paths/);
  });
});

describe('authentication config', () => {
  it('uses an install-only secret before an environment file exists', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-install-config-'),
    );
    tempDirs.push(root);

    expect(resolveAuthSecret(undefined, root)).toContain('install-mode');
    expect(
      auth({
        env: createConfigEnv({}),
        paths: createConfigPaths({ rootDir: root }),
      }).secret,
    ).toContain('install-mode');
  });

  it('still rejects a configured environment without AUTH_SECRET', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-auth-config-'),
    );
    tempDirs.push(root);
    writeFileSync(path.join(root, '.env'), 'APP_BASE_PATH=/main\n');

    expect(() => resolveAuthSecret(undefined, root)).toThrow(
      'AUTH_SECRET is required.',
    );
  });
});

describe('caching config', () => {
  it('declares the memory provider', () => {
    const config = caching({
      env: createConfigEnv({}),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config).toEqual({
      default: 'memory',
      providers: {
        memory: {
          driver: 'memory',
          defaultTtl: '5m',
          maxTtl: undefined,
          maxSize: 2_000,
          checkInterval: undefined,
          useClone: true,
        },
      },
    });
  });

  it('maps caching env values into the memory provider', () => {
    const config = caching({
      env: createConfigEnv({
        CACHING_DEFAULT: 'memory',
        CACHING_MEMORY_DEFAULT_TTL: '30s',
        CACHING_MEMORY_MAX_TTL: '1h',
        CACHING_MEMORY_MAX_SIZE: '100',
        CACHING_MEMORY_CHECK_INTERVAL: '5s',
        CACHING_MEMORY_USE_CLONE: 'false',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.default).toBe('memory');
    expect(config.providers.memory).toEqual({
      driver: 'memory',
      defaultTtl: '30s',
      maxTtl: '1h',
      maxSize: 100,
      checkInterval: '5s',
      useClone: false,
    });
  });
});

describe('logging config', () => {
  it('declares the system logger for pino', () => {
    const config = logging({
      env: createConfigEnv({}),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.default).toBe('system');
    expect(config).toMatchObject({
      name: 'app-template-default',
      level: 'info',
      base: {
        service: 'app-template-default',
      },
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
    expect(config.redact).toContain('headers.authorization');
  });

  it('maps logger env values into the system logger', () => {
    const config = logging({
      env: createConfigEnv({
        LOG_DEFAULT: 'system',
        LOG_LEVEL: 'debug',
        LOG_NAME: 'portal',
        LOG_PRETTY: 'true',
        LOG_SERVICE: 'portal-service',
        LOG_REDACT: 'password,headers.authorization,credentials.secret',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.default).toBe('system');
    expect(config).toEqual({
      default: 'system',
      name: 'portal',
      level: 'debug',
      base: {
        service: 'portal-service',
      },
      redact: ['password', 'headers.authorization', 'credentials.secret'],
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  });

  it('rolls structured output daily in production', () => {
    const config = logging({
      env: createConfigEnv({
        NODE_ENV: 'production',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.transport).toEqual({
      target: 'pino-roll',
      options: {
        file: path.join(
          '/tmp/app-template-default/storage',
          'logs/{logger}.log',
        ),
        frequency: 'daily',
        dateFormat: 'yyyy_MM_dd',
        mkdir: true,
        limit: {
          count: 6,
          removeOtherLogFiles: true,
        },
      },
    });
  });

  it('falls back to info for unsupported logger levels', () => {
    const config = logging({
      env: createConfigEnv({
        LOG_LEVEL: 'verbose',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.level).toBe('info');
  });
});

describe('queue config', () => {
  it('declares sync, redis, and database connections for queue jobs', () => {
    const config = queue({
      env: createConfigEnv({}),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.default).toBe('sync');
    expect(config.connections.sync).toEqual({
      driver: 'sync',
    });
    expect(config.connections.redis).toMatchObject({
      driver: 'redis',
      host: '127.0.0.1',
      port: 6379,
      db: 0,
      keyPrefix: 'nocobase:queue:',
      tls: false,
    });
    expect(config.connections.database).toEqual({
      driver: 'database',
      connection: undefined,
      table: 'queue_jobs',
      schedulesTable: 'queue_schedules',
    });
    expect(config.worker).toEqual({
      connection: undefined,
      queues: ['default'],
      concurrency: 1,
      idleDelay: '2s',
      timeout: undefined,
    });
    expect(config.jobs).toEqual({
      locations: ['/tmp/app-template-default/server/jobs/**/*.{ts,js}'],
      autoLoad: true,
      hotReload: false,
    });
  });

  it('maps queue env values into connections and worker options', () => {
    const config = queue({
      env: createConfigEnv({
        QUEUE_CONNECTION: 'redis',
        QUEUE_REDIS_PREFIX: 'portal:queue:',
        QUEUE_DB_CONNECTION: 'main',
        QUEUE_TABLE: 'jobs',
        QUEUE_SCHEDULES_TABLE: 'job_schedules',
        QUEUE_WORKER_CONNECTION: 'redis',
        QUEUE_WORKER_QUEUES: 'default,emails',
        QUEUE_WORKER_CONCURRENCY: '5',
        QUEUE_WORKER_IDLE_DELAY: '500ms',
        QUEUE_WORKER_TIMEOUT: '30s',
        QUEUE_JOBS_AUTO_LOAD: 'false',
        QUEUE_JOBS_HOT_RELOAD: 'true',
        REDIS_HOST: 'redis.internal',
        REDIS_PORT: '6380',
        REDIS_USERNAME: 'default',
        REDIS_PASSWORD: 'secret',
        REDIS_DB: '2',
        REDIS_TLS: 'true',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.default).toBe('redis');
    expect(config.connections.redis).toEqual({
      driver: 'redis',
      host: 'redis.internal',
      port: 6380,
      username: 'default',
      password: 'secret',
      db: 2,
      keyPrefix: 'portal:queue:',
      tls: true,
    });
    expect(config.connections.database).toEqual({
      driver: 'database',
      connection: 'main',
      table: 'jobs',
      schedulesTable: 'job_schedules',
    });
    expect(config.worker).toEqual({
      connection: 'redis',
      queues: ['default', 'emails'],
      concurrency: 5,
      idleDelay: '500ms',
      timeout: '30s',
    });
    expect(config.jobs).toMatchObject({
      autoLoad: false,
      hotReload: true,
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
      handler: undefined,
      runtimeGlobals: {
        NOCOBASE_PORTAL_BASE: '/main/',
        NOCOBASE_API_URL: '/main/api',
        __nocobase_api_client_storage_prefix__: 'NOCOBASE_',
        __nocobase_api_client_storage_type__: 'localStorage',
        __nocobase_api_client_share_token__: false,
      },
      runtime: {
        storagePrefix: 'NOCOBASE_',
        storageType: 'localStorage',
        shareToken: false,
      },
    });
  });

  it('uses the copied client index when config root is a deployment dist root', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-dist-root-'),
    );
    tempDirs.push(root);
    mkdirSync(path.join(root, 'client'), { recursive: true });
    writeFileSync(
      path.join(root, 'client', 'index.html'),
      '<div id="root"></div>',
    );

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

    expect(config.default).toBe('main');
    expect(config.connections).toHaveProperty('main');
    expect(Object.keys(config.connections)).toEqual(['main']);
    expect(config.connections.main).toMatchObject({
      dialect: 'sqlite',
      filename: '/tmp/app-template-default/storage/database.sqlite',
      debug: false,
    });
    expect(config.migrations).toEqual({
      directory: '/tmp/app-template-default/database/migrations',
      packageName: '@nocobase/app-template-default',
      autoRun: false,
      tableName: undefined,
      lockTableName: undefined,
    });
    expect(config.seeds).toEqual({
      directory: '/tmp/app-template-default/database/seeds',
      packageName: '@nocobase/app-template-default',
      autoRun: false,
      tableName: undefined,
      lockTableName: undefined,
    });
  });

  it('maps postgres env values into the main connection', () => {
    const config = database({
      env: createConfigEnv({
        DB_DIALECT: 'postgres',
        DB_HOST: 'db.internal',
        DB_PORT: '15432',
        DB_DATABASE: 'orders',
        DB_USERNAME: 'orders_user',
        DB_PASSWORD: 'secret',
        DB_SCHEMA: 'public,tenant',
        DB_DEBUG: 'true',
        DB_MIGRATIONS_AUTO_RUN: 'true',
        DB_SEEDS_AUTO_RUN: 'true',
        DB_SEEDS_TABLE: 'app_seeds',
        DB_SEEDS_LOCK_TABLE: 'app_seed_lock',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.default).toBe('main');
    expect(Object.keys(config.connections)).toEqual(['main']);
    expect(config.connections.main).toMatchObject({
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
    expect(config.seeds).toMatchObject({
      autoRun: true,
      tableName: 'app_seeds',
      lockTableName: 'app_seed_lock',
    });
  });

  it('does not consume database URL env values as connection config', () => {
    const config = database({
      env: createConfigEnv({
        DB_DIALECT: 'postgres',
        DB_URL: 'postgres://orders:secret@db.internal:5432/orders',
        DATABASE_URL: 'postgres://orders:secret@other.internal:5432/orders',
        DB_SCHEMA: 'public,tenant',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.connections.main).toMatchObject({
      dialect: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      database: 'app',
      username: 'postgres',
      password: '',
      ssl: false,
      schema: ['public', 'tenant'],
    });
    expect(config.connections.main).not.toHaveProperty('url');
  });

  it('maps mysql env values into the main connection', () => {
    const config = database({
      env: createConfigEnv({
        DB_DIALECT: 'mysql',
        DB_HOST: 'mysql.internal',
        DB_PORT: '13306',
        DB_DATABASE: 'orders',
        DB_USERNAME: 'orders_user',
        DB_PASSWORD: 'secret',
        DB_CHARSET: 'utf8mb4',
        DB_DEBUG: 'true',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.default).toBe('main');
    expect(Object.keys(config.connections)).toEqual(['main']);
    expect(config.connections.main).toMatchObject({
      dialect: 'mysql',
      host: 'mysql.internal',
      port: 13306,
      database: 'orders',
      username: 'orders_user',
      password: 'secret',
      charset: 'utf8mb4',
      debug: true,
    });
  });

  it('rejects unsupported database dialects', () => {
    expect(() =>
      database({
        env: createConfigEnv({ DB_DIALECT: 'postgresql' }),
        paths: createConfigPaths({
          rootDir: '/tmp/app-template-default',
        }),
      }),
    ).toThrow(
      'Invalid DB_DIALECT "postgresql". Expected "sqlite", "postgres", or "mysql".',
    );
  });
});

describe('drive config', () => {
  it('declares local and public disks without an unconfigured S3 disk', () => {
    const config = drive({
      env: createConfigEnv({}),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.default).toBe('local');
    expect(config.disks.local).toEqual({
      driver: 'fs',
      location: '/tmp/app-template-default/storage/app/private',
      visibility: 'private',
    });
    expect(config.disks.public).toEqual({
      driver: 'fs',
      location: '/tmp/app-template-default/storage/app/public',
      visibility: 'public',
      url: '/storage',
    });
    expect(config.disks.s3).toBeUndefined();
    expect(config.links).toEqual({
      '/tmp/app-template-default/public/storage':
        '/tmp/app-template-default/storage/app/public',
    });
  });

  it('maps drive env values into the S3 disk', () => {
    const config = drive({
      env: createConfigEnv({
        DRIVE_DISK: 's3',
        AWS_BUCKET: 'portal-assets',
        AWS_DEFAULT_REGION: 'ap-southeast-1',
        AWS_ACCESS_KEY_ID: 'access-key',
        AWS_SECRET_ACCESS_KEY: 'secret-key',
        AWS_ENDPOINT: 'https://s3.example.com',
        AWS_URL: 'https://cdn.example.com',
        AWS_USE_PATH_STYLE_ENDPOINT: 'true',
        AWS_SUPPORTS_ACL: 'false',
        AWS_SERVER_SIDE_ENCRYPTION: 'AES256',
        AWS_VISIBILITY: 'public',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.default).toBe('s3');
    expect(config.disks.s3).toEqual({
      driver: 's3',
      bucket: 'portal-assets',
      region: 'ap-southeast-1',
      endpoint: 'https://s3.example.com',
      cdnUrl: 'https://cdn.example.com',
      forcePathStyle: true,
      supportsACL: false,
      encryption: 'AES256',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
      },
      visibility: 'public',
    });
  });

  it('falls back to private visibility for unsupported S3 visibility values', () => {
    const config = drive({
      env: createConfigEnv({
        AWS_BUCKET: 'portal-assets',
        AWS_VISIBILITY: 'team',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.disks.s3.visibility).toBe('private');
  });
});

describe('app plugins', () => {
  it('resolves enabled plugins and their database sources', async () => {
    const config = resolveStandaloneConfig({ rootDir: templateRootDir });
    const plugin = (packageName: string) =>
      config.plugins.find((item) => item.packageName === packageName);

    expect(config.plugins.map((item) => item.packageName)).toEqual(
      expect.arrayContaining([
        '@nocobase/app-plugin-authentication',
        '@nocobase/app-plugin-authorization',
        '@nocobase/app-plugin-database-example',
        '@nocobase/app-plugin-file',
        '@nocobase/app-plugin-install',
        '@nocobase/app-plugin-queue-example',
        '@nocobase/app-plugin-realtime-example',
        '@nocobase/app-plugin-routes-example',
        '@nocobase/app-plugin-service-provider-example',
        '@nocobase/app-plugin-workflow',
      ]),
    );
    expect(plugin('@nocobase/app-plugin-authentication')).toMatchObject({
      version: declaredVersion('@nocobase/app-plugin-authentication'),
    });
    expect(
      plugin('@nocobase/app-plugin-authentication')?.migrationsDirectory,
    ).toMatch(/app-plugin-authentication\/database\/migrations$/);
    expect(
      plugin('@nocobase/app-plugin-authentication')?.seedsDirectory,
    ).toMatch(/app-plugin-authentication\/database\/seeds$/);
    expect(
      plugin('@nocobase/app-plugin-database-example')?.migrationsDirectory,
    ).toMatch(/app-plugin-database-example\/database\/migrations$/);
    expect(
      plugin('@nocobase/app-plugin-database-example')?.seedsDirectory,
    ).toMatch(/app-plugin-database-example\/database\/seeds$/);
    expect(
      plugin('@nocobase/app-plugin-workflow')?.migrationsDirectory,
    ).toMatch(/app-plugin-workflow\/database\/migrations$/);
    expect(plugin('@nocobase/app-plugin-queue-example')?.jobLocations).toEqual([
      expect.stringMatching(
        /app-plugin-queue-example\/server\/jobs\/\*\*\/\*\.\{ts,js,mts,mjs\}$/,
      ),
    ]);
    expect(config.queue.jobs?.locations).toEqual([
      expect.stringMatching(/app-template-default\/server\/jobs/),
      expect.stringMatching(
        /app-plugin-queue-example\/server\/jobs\/\*\*\/\*\.\{ts,js,mts,mjs\}$/,
      ),
    ]);
    expect(config.database.migrations.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: '@nocobase/app-template-default',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-authentication',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-database-example',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-workflow',
        }),
      ]),
    );
    expect(config.database.seeds?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: '@nocobase/app-template-default',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-authentication',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-database-example',
        }),
      ]),
    );

    await expect(
      validateMigrations({
        sources: config.database.migrations.sources ?? [],
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-authentication',
          name: '202608200001_create_authentication_tables',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-database-example',
          name: '202608220001_database_example_create_messages',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-workflow',
          name: '202608200001_create_workflow_collections',
        }),
      ]),
    );
    await expect(
      validateSeeds({
        sources: config.database.seeds?.sources ?? [],
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-database-example',
          name: '202608220002_database_example_create_welcome_message',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-authentication',
          name: '202608220003_authentication_create_default_admin_user',
        }),
      ]),
    );
  });
});

describe('standalone runtime database config', () => {
  it('loads database tasks without application-only configuration', () => {
    const rootDir = fileURLToPath(new URL('../..', import.meta.url));
    const config = resolveDatabaseTask({
      mode: 'standalone',
      env: {},
      paths: {
        rootDir,
        serverDir: path.join(rootDir, 'server'),
        databaseDir: path.join(rootDir, 'database'),
      },
      routing: {
        name: 'app-template-default',
        publicBasePath: '/app-template-default',
        internalBasePath: '',
      },
    });

    expect(config.database.default).toBe('main');
    expect(config).not.toHaveProperty('auth');
    expect(config.database.migrations.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: '@nocobase/app-template-default',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-authentication',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-database-example',
        }),
      ]),
    );
  });

  it('loads standalone database task config with plugin sources', () => {
    const config = resolveStandaloneDatabaseTask({
      rootDir: templateRootDir,
    });

    expect(config).not.toHaveProperty('auth');
    expect(config.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-authentication',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-install',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-database-example',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-routes-example',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-queue-example',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-realtime-example',
        }),
      ]),
    );
    expect(config).toHaveProperty('database');
    expect(config).not.toHaveProperty('dispose');
  });

  it('uses the active database directory for migrations and seeds', () => {
    const config = resolveStandaloneConfig({ rootDir: templateRootDir });

    expect(config.database.migrations.directory).toMatch(
      /database\/migrations$/,
    );
    expect(config.database.seeds?.directory).toMatch(/database\/seeds$/);
  });
});
