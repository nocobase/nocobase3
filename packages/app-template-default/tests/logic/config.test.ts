// @vitest-environment node

import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Knex } from 'knex';

import {
  createDatabaseManager,
  createMigrationContext,
  createMigrator,
  ensureMigrationTable,
  validateMigrations,
  validateSeeds,
} from '@nocobase/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createConfigEnv,
  createConfigPaths,
  loadConfig,
} from '@nocobase/app-server/config';

import app from '../../server/config/app.ts';
import caching from '../../server/config/caching.ts';
import configFactories from '../../server/config/index.ts';
import database from '../../server/config/database.ts';
import files from '../../server/config/files.ts';
import logging from '../../server/config/logging.ts';
import queue from '../../server/config/queue.ts';
import server from '../../server/config/server.ts';
import spa from '../../server/config/spa.ts';
import {
  createStandaloneDatabaseTaskRuntime,
  createStandaloneRuntime,
} from '../../server/index.ts';
import {
  loadDatabaseTaskConfig,
  loadEmbeddedAppConfig,
  loadStandaloneAppConfig,
} from '../../server/runtime/config.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
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
    expect(config.files.storage).toEqual({
      driver: 'local',
      root: '/tmp/app-template-default/storage/app/private/files',
    });
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
    expect(config.files.storage).toEqual({
      driver: 'local',
      root: path.join(dataDir, 'app/private/files'),
    });
    expect(config.logging).toMatchObject({
      default: 'system',
      name: 'app-template-default',
    });
    expect(config.queue.jobs?.locations).toEqual([
      path.join(root, 'dist/server/jobs/**/*.{ts,js}'),
    ]);
  });

  it('keeps Files config isolated between embedded apps and ignores host process env', () => {
    vi.stubEnv('FILES_STORAGE_DRIVER', 's3');
    vi.stubEnv('FILES_S3_BUCKET', 'host-bucket-must-not-leak');
    vi.stubEnv('FILES_S3_SECRET_ACCESS_KEY', 'host-secret-must-not-leak');
    const localRoot = mkdtempSync(
      path.join(tmpdir(), 'nocobase-files-embedded-local-'),
    );
    const s3Root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-files-embedded-s3-'),
    );
    tempDirs.push(localRoot, s3Root);
    mkdirSync(path.join(localRoot, 'dist'), { recursive: true });
    mkdirSync(path.join(s3Root, 'dist'), { recursive: true });
    writeFileSync(
      path.join(localRoot, 'dist/.env'),
      'FILES_UPLOAD_MAX_BYTES=512\n',
    );
    writeFileSync(
      path.join(s3Root, 'dist/.env'),
      [
        'FILES_STORAGE_DRIVER=s3',
        'FILES_S3_BUCKET=dist-bucket',
        'FILES_S3_ACCESS_KEY_ID=dist-access-key',
        'FILES_S3_SECRET_ACCESS_KEY=dist-secret-key',
      ].join('\n'),
    );

    const local = loadEmbeddedAppConfig(
      {
        id: 'local-app',
        basePath: '/local-app',
        rootDir: localRoot,
        dataDir: path.join(localRoot, 'data'),
        config: {
          authSecret: 'local-auth-secret-at-least-32-characters',
          filesUploadMaxBytes: 1024,
          filesTemporaryAccessExpiresInSeconds: 45,
        },
      },
      new URL('../../server/embedded.ts', import.meta.url).href,
    );
    const s3 = loadEmbeddedAppConfig(
      {
        id: 's3-app',
        basePath: '/s3-app',
        rootDir: s3Root,
        dataDir: path.join(s3Root, 'data'),
        config: {
          authSecret: 's3-auth-secret-at-least-32-characters',
          filesStorageDriver: 's3',
          filesS3Bucket: 'app-bucket',
          filesS3Region: 'auto',
          filesS3Endpoint: 'https://tenant.r2.example.com',
          filesS3Prefix: 'tenant-b',
          filesS3ForcePathStyle: false,
          filesS3AccessKeyId: 'tenant-access-key',
          filesS3SecretAccessKey: 'tenant-secret-key',
          filesS3SessionToken: 'tenant-session-token',
          filesTemporaryAccessExpiresInSeconds: 120,
          filesProviderUrlExpiresInSeconds: 15,
          filesPublicAccessEnabled: true,
        },
      },
      new URL('../../server/embedded.ts', import.meta.url).href,
    );

    expect(local.files).toMatchObject({
      storage: {
        driver: 'local',
        root: path.join(localRoot, 'data/app/private/files'),
      },
      upload: { maxBytes: 1024 },
      access: { temporaryExpiresInSeconds: 45 },
    });
    expect(s3.files).toEqual({
      storage: {
        driver: 's3',
        bucket: 'app-bucket',
        region: 'auto',
        endpoint: 'https://tenant.r2.example.com',
        prefix: 'tenant-b',
        forcePathStyle: false,
        credentials: {
          accessKeyId: 'tenant-access-key',
          secretAccessKey: 'tenant-secret-key',
          sessionToken: 'tenant-session-token',
        },
      },
      upload: { maxBytes: 52_428_800, expiresInSeconds: 900 },
      access: {
        temporaryExpiresInSeconds: 120,
        providerUrlExpiresInSeconds: 15,
      },
      publicAccess: { enabled: true },
    });
  });

  it('uses .env, then .env.local, then process.env for standalone Files config', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'nocobase-files-standalone-precedence-'),
    );
    tempDirs.push(root);
    mkdirSync(path.join(root, 'server'), { recursive: true });
    writeFileSync(
      path.join(root, '.env'),
      [
        'AUTH_SECRET=file-auth-secret-at-least-32-characters',
        'FILES_UPLOAD_MAX_BYTES=100',
      ].join('\n'),
    );
    writeFileSync(
      path.join(root, '.env.local'),
      'FILES_UPLOAD_MAX_BYTES=200\n',
    );
    vi.stubEnv('FILES_UPLOAD_MAX_BYTES', '300');

    const config = loadStandaloneAppConfig(
      new URL(`file://${path.join(root, 'server/standalone.js')}`).href,
    );

    expect(config.files.upload.maxBytes).toBe(300);
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

describe('files config', () => {
  it('defaults to private Local storage', () => {
    const config = files({
      env: createConfigEnv({}),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config).toEqual({
      storage: {
        driver: 'local',
        root: '/tmp/app-template-default/storage/app/private/files',
      },
      upload: { maxBytes: 52_428_800, expiresInSeconds: 900 },
      access: {
        temporaryExpiresInSeconds: 300,
        providerUrlExpiresInSeconds: 60,
      },
      publicAccess: { enabled: false },
    });
  });

  it('maps Files env values into private S3-compatible storage', () => {
    const config = files({
      env: createConfigEnv({
        FILES_STORAGE_DRIVER: 's3',
        FILES_S3_BUCKET: 'portal-files',
        FILES_S3_REGION: 'ap-southeast-1',
        FILES_S3_ACCESS_KEY_ID: 'access-key',
        FILES_S3_SECRET_ACCESS_KEY: 'secret-key',
        FILES_S3_ENDPOINT: 'https://s3.example.com',
        FILES_S3_PREFIX: 'tenant-a',
        FILES_S3_FORCE_PATH_STYLE: 'true',
        FILES_UPLOAD_MAX_BYTES: '2048',
        FILES_TEMPORARY_ACCESS_EXPIRES_IN_SECONDS: '90',
        FILES_PROVIDER_URL_EXPIRES_IN_SECONDS: '12',
        FILES_PUBLIC_ACCESS_ENABLED: 'true',
      }),
      paths: createConfigPaths({
        rootDir: '/tmp/app-template-default',
      }),
    });

    expect(config).toEqual({
      storage: {
        driver: 's3',
        bucket: 'portal-files',
        region: 'ap-southeast-1',
        endpoint: 'https://s3.example.com',
        prefix: 'tenant-a',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'access-key',
          secretAccessKey: 'secret-key',
        },
      },
      upload: { maxBytes: 2048, expiresInSeconds: 900 },
      access: {
        temporaryExpiresInSeconds: 90,
        providerUrlExpiresInSeconds: 12,
      },
      publicAccess: { enabled: true },
    });
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
    ]);
  });

  it('accepts existing history checksums for baseline migrations', async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'baseline-migration-history-'),
    );
    tempDirs.push(root);
    const runtime = createStandaloneRuntime();
    const sources = runtime.config.database.migrations.sources ?? [];
    const expectedChecksums = new Map([
      [
        '202608180001_create_app_settings_table',
        '7a8f342fb41017789a463e58b25ffd9151e43b45fc072e09eda9b4bda63cd53a',
      ],
      [
        '202608200001_create_authentication_tables',
        'b5e33e9b71bf4c7345c766147e3ec1e0c4054ef208d2b01dbdf3284e53290edf',
      ],
      [
        '202608220001_database_example_create_messages',
        '1fced190e8ecf1a63d1f8f621f292bf8357cbf27c89e8d0f8c80e9089392c40a',
      ],
    ]);
    const migrations = (await validateMigrations({ sources })).filter(
      (migration) => expectedChecksums.has(migration.name),
    );
    expect(
      new Map(
        migrations.map((migration) => [migration.name, migration.checksum]),
      ),
    ).toEqual(expectedChecksums);

    const databaseManager = createDatabaseManager({
      default: 'sqlite',
      connections: {
        sqlite: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(root, 'database.sqlite'),
        },
      },
    });
    const connection = databaseManager.connection('sqlite');
    const migrationConnection = createMigrationContext(connection).connection;
    const tableName = 'existing_migration_history';
    await ensureMigrationTable(migrationConnection, tableName);
    const knex = await connection.client<Knex>();
    await knex(tableName).insert(
      migrations.map((migration, index) => ({
        package_name: migration.packageName,
        name: migration.name,
        batch: 1,
        checksum: expectedChecksums.get(migration.name),
        executed_at: new Date(),
        duration_ms: index,
      })),
    );

    try {
      await expect(
        createMigrator({
          database: databaseManager,
          connection: 'sqlite',
          sources,
          tableName,
        }).restoreMetadata(),
      ).resolves.toEqual({ restored: [] });
    } finally {
      await databaseManager.destroy();
    }
  });
});

describe('app plugins', () => {
  it('resolves enabled plugins and their database sources', async () => {
    const runtime = createStandaloneRuntime();
    const authenticationPlugin = runtime.config.plugins.find(
      (item) => item.packageName === '@nocobase/app-plugin-authentication',
    );
    const filesPlugin = runtime.config.plugins.find(
      (item) => item.packageName === '@nocobase/app-plugin-files',
    );
    const databaseExamplePlugin = runtime.config.plugins.find(
      (item) => item.packageName === '@nocobase/app-plugin-database-example',
    );
    const routesExamplePlugin = runtime.config.plugins.find(
      (item) => item.packageName === '@nocobase/app-plugin-routes-example',
    );
    const queueExamplePlugin = runtime.config.plugins.find(
      (item) => item.packageName === '@nocobase/app-plugin-queue-example',
    );
    const realtimeExamplePlugin = runtime.config.plugins.find(
      (item) => item.packageName === '@nocobase/app-plugin-realtime-example',
    );

    expect(authenticationPlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-authentication',
      version: '0.1.0',
      enabled: true,
    });
    expect(authenticationPlugin?.migrationsDirectory).toMatch(
      /app-plugin-authentication\/database\/migrations$/,
    );
    expect(authenticationPlugin?.seedsDirectory).toMatch(
      /app-plugin-authentication\/database\/seeds$/,
    );
    expect(filesPlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-files',
      version: '0.1.0',
      enabled: true,
    });
    expect(filesPlugin?.migrationsDirectory).toMatch(
      /app-plugin-files\/database\/migrations$/,
    );
    expect(filesPlugin?.routesEntry).toMatch(
      /app-plugin-files\/server\/routes\/index\.ts$/,
    );
    expect(databaseExamplePlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-database-example',
      version: '0.1.0',
      enabled: true,
    });
    expect(databaseExamplePlugin?.migrationsDirectory).toMatch(
      /app-plugin-database-example\/database\/migrations$/,
    );
    expect(databaseExamplePlugin?.seedsDirectory).toMatch(
      /app-plugin-database-example\/database\/seeds$/,
    );
    expect(databaseExamplePlugin?.routesEntry).toBeUndefined();
    expect(routesExamplePlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-routes-example',
      version: '0.1.0',
      enabled: true,
    });
    expect(routesExamplePlugin?.migrationsDirectory).toBeUndefined();
    expect(routesExamplePlugin?.seedsDirectory).toBeUndefined();
    expect(routesExamplePlugin?.routesEntry).toMatch(
      /app-plugin-routes-example\/server\/routes\/index\.ts$/,
    );
    expect(queueExamplePlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-queue-example',
      version: '0.1.0',
      enabled: true,
    });
    expect(queueExamplePlugin?.jobsDirectory).toMatch(
      /app-plugin-queue-example\/server\/jobs$/,
    );
    expect(queueExamplePlugin?.routesEntry).toMatch(
      /app-plugin-queue-example\/server\/routes\/index\.ts$/,
    );
    expect(realtimeExamplePlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-realtime-example',
      version: '0.1.0',
      enabled: true,
    });
    expect(realtimeExamplePlugin?.routesEntry).toMatch(
      /app-plugin-realtime-example\/server\/routes\/index\.ts$/,
    );
    expect(realtimeExamplePlugin?.bootstrapEntry).toMatch(
      /app-plugin-realtime-example\/server\/bootstrap\.ts$/,
    );
    expect(runtime.config.queue.jobs?.locations).toEqual([
      expect.stringMatching(/app-template-default\/server\/jobs/),
      expect.stringMatching(
        /app-plugin-queue-example\/server\/jobs\/\*\*\/\*\.\{ts,js,mts,mjs\}$/,
      ),
    ]);
    expect(runtime.config.database.migrations.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: '@nocobase/app-template-default',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-authentication',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-files',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-database-example',
        }),
      ]),
    );
    expect(runtime.config.database.seeds?.sources).toEqual(
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
        sources: runtime.config.database.migrations.sources ?? [],
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-authentication',
          name: '202608200001_create_authentication_tables',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-files',
          name: '202608221000_files_create_files',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-database-example',
          name: '202608220001_database_example_create_messages',
        }),
      ]),
    );
    await expect(
      validateSeeds({
        sources: runtime.config.database.seeds?.sources ?? [],
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
    const config = loadDatabaseTaskConfig({
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
        internalApiProxyPath: '/v2/api',
        publicApiUrl: '/app-template-default/v2/api',
      },
    });

    expect(config.database.default).toBe('sqlite');
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

  it('creates a database task runtime with plugin sources', async () => {
    const runtime = createStandaloneDatabaseTaskRuntime();

    expect(runtime.config).not.toHaveProperty('auth');
    expect(runtime.config.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-authentication',
          enabled: true,
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-database-example',
          enabled: true,
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-routes-example',
          enabled: true,
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-queue-example',
          enabled: true,
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-realtime-example',
          enabled: true,
        }),
      ]),
    );
    expect(runtime.migrator).toBeDefined();
    expect(runtime.seeder).toBeDefined();

    await runtime.dispose();
  });

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
