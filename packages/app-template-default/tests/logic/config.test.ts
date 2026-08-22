// @vitest-environment node

import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateMigrations, validateSeeds } from '@nocobase/database';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createConfigEnv,
  createConfigPaths,
  loadConfig,
} from '@nocobase/app-server/config';

import app from '../../server/config/app.ts';
import caching from '../../server/config/caching.ts';
import configFactories from '../../server/config/index.ts';
import database from '../../server/config/database.ts';
import drive from '../../server/config/drive.ts';
import logging from '../../server/config/logging.ts';
import queue from '../../server/config/queue.ts';
import server from '../../server/config/server.ts';
import spa from '../../server/config/spa.ts';
import { createStandaloneRuntime } from '../../server/index.ts';
import { loadEmbeddedAppConfig } from '../../server/runtime/config.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const tempDirs: string[] = [];

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

    expect(config.app.name).toBe('app-template-default');
    expect(config.auth.emailAndPassword).toMatchObject({
      enabled: true,
      autoSignIn: false,
    });
    expect(config.auth.session).toMatchObject({
      storeSessionInDatabase: true,
    });
    expect(config.caching.default).toBe('memory');
    expect(config.database.default).toBe('sqlite');
    expect(config.drive.default).toBe('local');
    expect(config.logging.default).toBe('system');
    expect(config.queue.default).toBe('sync');
    expect(config.server.host).toBe('127.0.0.1');
    expect(config.spa.indexPath).toBe(
      '/tmp/app-template-default/dist/client/index.html',
    );
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
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-template-default-embedded-config-'),
    );
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
        config: { authSecret: 'test-auth-secret-at-least-32-characters' },
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
    expect(config.caching.providers.memory).toMatchObject({
      driver: 'memory',
    });
    expect(config.database.connections.sqlite).toMatchObject({
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
    expect(config.queue.jobs?.locations).toEqual([
      path.join(root, 'dist/server/jobs/**/*.{ts,js}'),
    ]);
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

  it('uses structured output by default in production', () => {
    const config = logging({
      env: createConfigEnv({
        NODE_ENV: 'production',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.transport).toBeUndefined();
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
        QUEUE_DB_CONNECTION: 'postgres',
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
      connection: 'postgres',
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

    expect(config.default).toBe('sqlite');
    expect(config.connections.sqlite).toMatchObject({
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
        DB_SEEDS_AUTO_RUN: 'true',
        DB_SEEDS_TABLE: 'app_seeds',
        DB_SEEDS_LOCK_TABLE: 'app_seed_lock',
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
    expect(config.seeds).toMatchObject({
      autoRun: true,
      tableName: 'app_seeds',
      lockTableName: 'app_seed_lock',
    });
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

describe('drive config', () => {
  it('declares Laravel-style local, public, and S3 disks for Flydrive adapters', () => {
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
    expect(config.disks.s3).toMatchObject({
      driver: 's3',
      bucket: '',
      region: 'us-east-1',
      forcePathStyle: false,
      supportsACL: true,
      credentials: {
        accessKeyId: undefined,
        secretAccessKey: undefined,
      },
      visibility: 'private',
    });
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
        AWS_VISIBILITY: 'team',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config.disks.s3.visibility).toBe('private');
  });
});

describe('database migrations', () => {
  it('loads template migration files with the current definition format', async () => {
    const directory = fileURLToPath(
      new URL('../../database/migrations', import.meta.url),
    );

    await expect(validateMigrations(directory)).resolves.toEqual([
      expect.objectContaining({
        name: '202608180001_create_app_settings_table',
        fileName: '202608180001_create_app_settings_table.ts',
      }),
      expect.objectContaining({
        name: '202608200001_create_authentication_tables',
        fileName: '202608200001_create_authentication_tables.ts',
      }),
    ]);
  });
});

describe('app plugins', () => {
  it('resolves the example plugin and its enabled database sources', async () => {
    const runtime = createStandaloneRuntime();
    const plugin = runtime.config.plugins.find(
      (item) => item.packageName === '@nocobase/app-plugin-example',
    );

    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-example',
      version: '0.1.0',
      enabled: true,
    });
    expect(plugin?.migrationsDirectory).toMatch(
      /app-plugin-example\/database\/migrations$/,
    );
    expect(plugin?.seedsDirectory).toMatch(
      /app-plugin-example\/database\/seeds$/,
    );
    expect(runtime.config.database.migrations.sources).toEqual([
      expect.objectContaining({
        packageName: '@nocobase/app-template-default',
      }),
      expect.objectContaining({
        packageName: '@nocobase/app-plugin-example',
      }),
    ]);
    expect(runtime.config.database.seeds?.sources).toEqual([
      expect.objectContaining({
        packageName: '@nocobase/app-template-default',
      }),
      expect.objectContaining({
        packageName: '@nocobase/app-plugin-example',
      }),
    ]);

    await expect(
      validateMigrations({
        sources: runtime.config.database.migrations.sources ?? [],
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-example',
          name: '202608220001_example_create_messages',
        }),
      ]),
    );
    await expect(
      validateSeeds({
        sources: runtime.config.database.seeds?.sources ?? [],
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        packageName: '@nocobase/app-plugin-example',
        name: '202608220002_example_create_welcome_message',
      }),
    ]);
  });
});

describe('standalone runtime database config', () => {
  it('uses the active database directory for migrations and seeds', () => {
    const runtime = createStandaloneRuntime();

    expect(runtime.config.database.migrations.directory).toMatch(
      /database\/migrations$/,
    );
    expect(runtime.config.database.seeds?.directory).toMatch(
      /database\/seeds$/,
    );
  });
});
