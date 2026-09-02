import { existsSync } from 'node:fs';
import path from 'node:path';

import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import { appConfig } from '@nocobase/app-server/config';
import { databaseConfig } from '@nocobase/app-server/database';
import { nodeServerConfig } from '@nocobase/app-server/node';
import { spaConfig } from '@nocobase/app-server/spa';
import {
  cachingConfig,
  driveConfig,
  loggingConfig,
  queueConfig,
  sessionConfig,
  snowflakeConfig,
} from '@nocobase/app-server';
import { notificationConfig } from '@nocobase/app-plugin-notification/server';
import appRuntime from '../server/runtime.ts';

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ObjectValue = Record<string, unknown>;

const rootDir = path.resolve(import.meta.dirname, '..');
const configFiles = [path.join(rootDir, 'config.yml')];
const runtime = await resolveStandaloneAppRuntime(appRuntime, { rootDir });
const app = runtime.appConfig.get(appConfig);
const server = runtime.appConfig.get(nodeServerConfig);
const spa = runtime.appConfig.get(spaConfig);
const logging = runtime.appConfig.get(loggingConfig);
const caching = runtime.appConfig.get(cachingConfig);
const snowflake = runtime.appConfig.get(snowflakeConfig);
const database = runtime.appConfig.get(databaseConfig);
const drive = runtime.appConfig.get(driveConfig);
const queue = runtime.appConfig.get(queueConfig);
const session = runtime.appConfig.get(sessionConfig);
const notification = runtime.appConfig.get(notificationConfig);

const activeLoggerName = logging.default;
const configuredLogger = activeLoggerName
  ? logging.loggers?.[activeLoggerName]
  : undefined;
const activeLogger = {
  ...logging,
  ...configuredLogger,
  base: mergeObject(logging.base, configuredLogger?.base),
};
const activeCachingProviderName = caching.default;
const cachingProviders: Record<string, unknown> = caching.providers;
const activeCachingProvider = activeCachingProviderName
  ? cachingProviders[activeCachingProviderName]
  : undefined;
const activeDatabaseName = database.default;
const databaseConnections: Record<string, unknown> = database.connections;
const activeDatabase = activeDatabaseName
  ? databaseConnections[activeDatabaseName]
  : undefined;
const activeDriveName = drive.default;
const driveDisks: Record<string, unknown> = drive.disks;
const activeDrive = activeDriveName ? driveDisks[activeDriveName] : undefined;
const activeQueueName = queue.default;
const queueConnections: Record<string, unknown> = queue.connections;
const activeQueue = activeQueueName
  ? queueConnections[activeQueueName]
  : undefined;
const activeSessionName = session.default;
const sessionStores: Record<string, unknown> = session.stores;
const activeSession = activeSessionName
  ? sessionStores[activeSessionName]
  : undefined;
const report = {
  mode: 'standalone',
  configFiles: configFiles.map((file) => ({
    path: file,
    exists: existsSync(file),
  })),
  app: {
    name: app.name,
    publicOrigin: app.publicOrigin ?? '(request-derived)',
    publicBasePath: app.publicBasePath || '/',
    internalBasePath: app.internalBasePath,
    publicApiUrl: app.publicApiUrl,
  },
  server: {
    host: server.host,
    port: server.port,
    startLog: server.startLog,
    viteDevUrl: formatOptionalUrl(server.viteDevUrl),
  },
  spa: {
    indexPath: spa.indexPath,
    indexExists: existsSync(spa.indexPath),
    runtime: spa.runtime,
  },
  logging: {
    default: activeLoggerName || '(none)',
    active: summarizeLogger(activeLogger),
  },
  caching: {
    default: activeCachingProviderName || '(none)',
    active: summarizeCachingProvider(activeCachingProvider),
  },
  snowflake: {
    workerId: snowflake.workerId,
    epoch: snowflake.epoch,
  },
  database: {
    default: activeDatabaseName || '(none)',
    active: summarizeDatabaseConnection(activeDatabase),
    migrations: {
      directory: database.migrations.directory,
      directoryExists: existsSync(database.migrations.directory),
      autoRun: database.migrations.autoRun,
      tableName: database.migrations.tableName ?? '(default)',
      lockTableName: database.migrations.lockTableName ?? '(default)',
    },
    seeds: {
      directory: database.seeds?.directory ?? '(not configured)',
      directoryExists: database.seeds
        ? existsSync(database.seeds.directory)
        : false,
      autoRun: database.seeds?.autoRun ?? false,
      tableName: database.seeds?.tableName ?? '(default)',
      lockTableName: database.seeds?.lockTableName ?? '(default)',
    },
  },
  plugins: runtime.plugins.plugins.map(({ metadata: plugin }) => ({
    packageName: plugin.packageName,
    version: plugin.version,
    migrationsDirectory: plugin.migrationsDirectory ?? '(none)',
    seedsDirectory: plugin.seedsDirectory ?? '(none)',
  })),
  drive: {
    default: activeDriveName || '(none)',
    active: summarizeDriveDisk(activeDrive),
    links: drive.links,
  },
  queue: {
    default: activeQueueName || '(none)',
    active: summarizeQueueConnection(activeQueue),
    worker: {
      connection: queue.worker?.connection ?? '(default)',
      queues: queue.worker?.queues ?? [],
      concurrency: queue.worker?.concurrency ?? 1,
      idleDelay: String(queue.worker?.idleDelay ?? '2s'),
      timeout: queue.worker?.timeout ? String(queue.worker.timeout) : '(none)',
    },
    jobs: {
      locations: queue.jobs?.locations ?? [],
      autoLoad: queue.jobs?.autoLoad ?? true,
      hotReload: queue.jobs?.hotReload ?? false,
    },
  },
  workflow: {
    queueName: `workflow:${app.name}`,
  },
  session: {
    enabled: session.enabled ?? true,
    default: activeSessionName || '(none)',
    active: summarizeSessionStore(activeSession),
    cookie: {
      name: session.cookie.name,
      path: session.cookie.path ?? '/',
      domain: session.cookie.domain ?? '(current host)',
      secure: session.cookie.secure ?? false,
      httpOnly: session.cookie.httpOnly ?? true,
      sameSite: session.cookie.sameSite ?? 'lax',
      partitioned: session.cookie.partitioned ?? false,
      expireOnClose: session.cookie.expireOnClose ?? false,
    },
    lifetime: {
      absolute: String(session.lifetime.absolute),
      inactivity: session.lifetime.inactivity
        ? String(session.lifetime.inactivity)
        : '(none)',
      rolling: session.lifetime.rolling ?? true,
    },
    secret: session.secret ? '<configured>' : '(ephemeral)',
    previousSecrets: session.previousSecrets?.length ?? 0,
    gcLottery: session.gcLottery
      ? [session.gcLottery.hits, session.gcLottery.total]
      : [2, 100],
  },
  notification: {
    test: {
      enabled: notification.test?.enabled ?? false,
    },
    channels: notification.channels.map((channel) => ({
      type: channel.type,
      enabled: channel.enabled,
      providers: channel.providers.map((provider) => ({
        name: provider.name,
        type: provider.type,
        enabled: provider.enabled ?? true,
      })),
    })),
  },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

function summarizeDatabaseConnection(connection: unknown): JsonValue {
  if (!isObject(connection)) {
    return null;
  }

  const dialect = stringValue(connection.dialect) ?? 'unknown';
  const summary: Record<string, JsonValue> = {
    dialect,
    debug: booleanValue(connection.debug) ?? false,
  };

  if (dialect === 'sqlite') {
    summary.filename = stringValue(connection.filename) ?? '(not configured)';
    return summary;
  }

  for (const key of ['host', 'port', 'database', 'username', 'schema', 'ssl']) {
    const value = connection[key];
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      summary[key] = value;
    } else if (
      Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
    ) {
      summary[key] = value;
    }
  }

  return summary;
}

function summarizeLogger(logger: unknown): JsonValue {
  if (!isObject(logger)) {
    return null;
  }

  const summary: Record<string, JsonValue> = {};

  for (const key of ['name', 'level']) {
    const value = stringValue(logger[key]);
    if (value) {
      summary[key] = value;
    }
  }

  const enabled = booleanValue(logger.enabled);
  if (enabled !== undefined) {
    summary.enabled = enabled;
  }

  if (isObject(logger.base)) {
    summary.base = jsonObject(logger.base);
  }

  if (Array.isArray(logger.redact)) {
    summary.redactPaths = logger.redact.length;
  }

  if (isObject(logger.transport)) {
    summary.transport = jsonObject(logger.transport);
  }

  return summary;
}

function mergeObject(
  base: Readonly<Record<string, unknown>> | null | undefined,
  override: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (override === undefined) {
    return base;
  }
  if (!isObject(base) || !isObject(override)) {
    return override;
  }
  return {
    ...base,
    ...override,
  };
}

function summarizeCachingProvider(provider: unknown): JsonValue {
  if (!isObject(provider)) {
    return null;
  }

  const driver = stringValue(provider.driver) ?? 'unknown';
  const summary: Record<string, JsonValue> = {
    driver,
  };

  for (const key of ['defaultTtl', 'maxTtl', 'maxSize', 'checkInterval']) {
    const value = provider[key];
    if (typeof value === 'string' || typeof value === 'number') {
      summary[key] = value;
    }
  }

  for (const key of ['useClone']) {
    const value = booleanValue(provider[key]);
    if (value !== undefined) {
      summary[key] = value;
    }
  }

  return summary;
}

function summarizeDriveDisk(disk: unknown): JsonValue {
  if (!isObject(disk)) {
    return null;
  }

  const driver = stringValue(disk.driver) ?? 'unknown';
  const summary: Record<string, JsonValue> = {
    driver,
    visibility: stringValue(disk.visibility) ?? 'private',
  };

  for (const key of [
    'location',
    'bucket',
    'region',
    'endpoint',
    'url',
    'cdnUrl',
    'encryption',
  ]) {
    const value = disk[key];
    if (typeof value === 'string' && value) {
      summary[key] = value;
    }
  }

  for (const key of ['forcePathStyle', 'supportsACL']) {
    const value = booleanValue(disk[key]);
    if (value !== undefined) {
      summary[key] = value;
    }
  }

  if (isObject(disk.credentials)) {
    summary.credentials = {
      accessKeyId: stringValue(disk.credentials.accessKeyId)
        ? '<configured>'
        : '(missing)',
      secretAccessKey: stringValue(disk.credentials.secretAccessKey)
        ? '<configured>'
        : '(missing)',
    };
  }

  return summary;
}

function summarizeQueueConnection(connection: unknown): JsonValue {
  if (!isObject(connection)) {
    return null;
  }

  const driver = stringValue(connection.driver) ?? 'unknown';
  const summary: Record<string, JsonValue> = {
    driver,
  };

  for (const key of [
    'host',
    'port',
    'db',
    'keyPrefix',
    'connection',
    'table',
    'schedulesTable',
  ]) {
    const value = connection[key];
    if (typeof value === 'string' || typeof value === 'number') {
      summary[key] = value;
    }
  }

  const tls = booleanValue(connection.tls);
  if (tls !== undefined) {
    summary.tls = tls;
  }

  for (const key of ['username', 'password']) {
    const value = stringValue(connection[key]);
    if (value) {
      summary[key] = '<configured>';
    }
  }

  return summary;
}

function summarizeSessionStore(store: unknown): JsonValue {
  if (!isObject(store)) {
    return null;
  }

  const driver = stringValue(store.driver) ?? 'unknown';
  const summary: Record<string, JsonValue> = {
    driver,
  };

  for (const key of ['base', 'url', 'host', 'port', 'db', 'keyPrefix', 'ttl']) {
    const value = store[key];
    if (typeof value === 'string') {
      summary[key] = key === 'url' ? formatOptionalUrl(value) : value;
    } else if (typeof value === 'number') {
      summary[key] = value;
    }
  }

  const tls = booleanValue(store.tls);
  if (tls !== undefined) {
    summary.tls = tls;
  }

  for (const key of ['username', 'password']) {
    const value = stringValue(store[key]);
    if (value) {
      summary[key] = '<configured>';
    }
  }

  return summary;
}

function printReport(value: typeof report): void {
  printSection('Server mode');
  printPair('Mode', value.mode);
  printPair(
    'Config files',
    value.configFiles
      .map(
        (file) =>
          `${path.relative(rootDir, file.path)}:${file.exists ? 'found' : 'missing'}`,
      )
      .join(', '),
  );

  printSection('App routing');
  printPair('App name', value.app.name);
  printPair('Public origin', value.app.publicOrigin);
  printPair('Public base path', value.app.publicBasePath);
  printPair(
    'Internal base path',
    value.app.internalBasePath || '(app-local root)',
  );
  printPair('Public API URL', value.app.publicApiUrl);

  printSection('HTTP server');
  printPair('Host', value.server.host);
  printPair('Port', String(value.server.port));
  printPair('Startup log', String(value.server.startLog));
  printPair('Vite dev proxy', value.server.viteDevUrl);

  printSection('SPA runtime');
  printPair(
    'Index path',
    `${value.spa.indexPath} (${value.spa.indexExists ? 'exists' : 'missing'})`,
  );
  printPair('Storage prefix', value.spa.runtime.storagePrefix);
  printPair('Storage type', value.spa.runtime.storageType);
  printPair('Share token', String(value.spa.runtime.shareToken));

  printSection('Logger');
  printPair('Default logger', value.logging.default);
  printJson('Active logger', value.logging.active);

  printSection('Caching');
  printPair('Default provider', value.caching.default);
  printJson('Active provider', value.caching.active);

  printSection('Snowflake ID generator');
  printPair('Worker ID', String(value.snowflake.workerId));
  printPair('Epoch', String(value.snowflake.epoch));

  printSection('Database');
  printPair('Default connection', value.database.default);
  printJson('Active connection', value.database.active);
  printPair(
    'Migrations directory',
    `${value.database.migrations.directory} (${value.database.migrations.directoryExists ? 'exists' : 'missing'})`,
  );
  printPair('Auto-run migrations', String(value.database.migrations.autoRun));
  printPair('Migration table', value.database.migrations.tableName);
  printPair('Migration lock table', value.database.migrations.lockTableName);
  printPair(
    'Seeds directory',
    `${value.database.seeds.directory} (${value.database.seeds.directoryExists ? 'exists' : 'missing'})`,
  );
  printPair('Auto-run seeds', String(value.database.seeds.autoRun));
  printPair('Seed table', value.database.seeds.tableName);
  printPair('Seed lock table', value.database.seeds.lockTableName);

  printSection('Plugins');
  printJson('Registered plugins', value.plugins);

  printSection('Drive');
  printPair('Default disk', value.drive.default);
  printJson('Active disk', value.drive.active);
  printJson('Links', value.drive.links);

  printSection('Queue');
  printPair('Default connection', value.queue.default);
  printJson('Active connection', value.queue.active);
  printPair('Worker connection', value.queue.worker.connection);
  printPair('Worker queues', value.queue.worker.queues.join(', ') || '(none)');
  printPair('Worker concurrency', String(value.queue.worker.concurrency));
  printPair('Worker idle delay', value.queue.worker.idleDelay);
  printPair('Worker timeout', value.queue.worker.timeout);
  printJson('Job locations', value.queue.jobs.locations);
  printPair('Auto-load jobs', String(value.queue.jobs.autoLoad));
  printPair('Hot reload jobs', String(value.queue.jobs.hotReload));

  printSection('Workflow');
  printPair('Queue name', value.workflow.queueName);

  printSection('Session');
  printPair('Enabled', String(value.session.enabled));
  printPair('Default store', value.session.default);
  printJson('Active store', value.session.active);
  printPair('Cookie name', value.session.cookie.name);
  printPair('Cookie path', value.session.cookie.path);
  printPair('Cookie domain', value.session.cookie.domain);
  printPair('Cookie secure', String(value.session.cookie.secure));
  printPair('Cookie httpOnly', String(value.session.cookie.httpOnly));
  printPair('Cookie sameSite', value.session.cookie.sameSite);
  printPair('Cookie partitioned', String(value.session.cookie.partitioned));
  printPair('Expire on close', String(value.session.cookie.expireOnClose));
  printPair('Absolute lifetime', value.session.lifetime.absolute);
  printPair('Inactivity timeout', value.session.lifetime.inactivity);
  printPair('Rolling inactivity', String(value.session.lifetime.rolling));
  printPair('Secret', value.session.secret);
  printPair('Previous secrets', String(value.session.previousSecrets));
  printPair('GC lottery', value.session.gcLottery.join('/'));

  printSection('Useful checks');
  printPair(
    'Server-focused tests',
    'pnpm test -- tests/logic/app-server.test.ts tests/logic/config.test.ts',
  );
  printPair('Typecheck', 'pnpm typecheck');
  printPair('JSON output', 'pnpm server:config -- --json');
}

function printSection(title: string): void {
  console.log(`\n${title}`);
}

function printPair(label: string, value: string): void {
  console.log(`  ${label.padEnd(24)} ${value}`);
}

function printJson(label: string, value: JsonValue): void {
  printPair(label, JSON.stringify(value));
}

function formatOptionalUrl(value: string | URL | null | undefined): string {
  if (!value) {
    return '(not configured)';
  }

  const url = typeof value === 'string' ? new URL(value) : value;
  const redacted = new URL(url);
  redacted.username = redacted.username ? '<redacted>' : '';
  redacted.password = redacted.password ? '<redacted>' : '';
  redacted.search = '';
  redacted.hash = '';
  return redacted.toString();
}

function isObject(value: unknown): value is ObjectValue {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function jsonObject(value: ObjectValue): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};

  for (const [key, item] of Object.entries(value)) {
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      Array.isArray(item)
    ) {
      result[key] = item as JsonValue;
    }
  }

  return result;
}
