import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadStandaloneAppConfig } from '../server/runtime/config.ts';

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ObjectValue = Record<string, unknown>;

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const envFiles = [path.join(rootDir, '.env'), path.join(rootDir, '.env.local')];
const standaloneModuleUrl = new URL('../server/standalone.ts', import.meta.url)
  .href;

const config = loadStandaloneAppConfig(standaloneModuleUrl);

const activeLoggerName = config.logging.default;
const configuredLogger = activeLoggerName
  ? config.logging.loggers?.[activeLoggerName]
  : undefined;
const activeLogger = {
  ...config.logging,
  ...configuredLogger,
  base: mergeObject(config.logging.base, configuredLogger?.base),
};
const activeCachingProviderName = config.caching.default;
const cachingProviders: Record<string, unknown> = config.caching.providers;
const activeCachingProvider = activeCachingProviderName
  ? cachingProviders[activeCachingProviderName]
  : undefined;
const activeDatabaseName = config.database.default;
const databaseConnections: Record<string, unknown> =
  config.database.connections;
const activeDatabase = activeDatabaseName
  ? databaseConnections[activeDatabaseName]
  : undefined;
const activeDriveName = config.drive.default;
const driveDisks: Record<string, unknown> = config.drive.disks;
const activeDrive = activeDriveName ? driveDisks[activeDriveName] : undefined;
const activeQueueName = config.queue.default;
const queueConnections: Record<string, unknown> = config.queue.connections;
const activeQueue = activeQueueName
  ? queueConnections[activeQueueName]
  : undefined;
const activeSessionName = config.session.default;
const sessionStores: Record<string, unknown> = config.session.stores;
const activeSession = activeSessionName
  ? sessionStores[activeSessionName]
  : undefined;
const report = {
  mode: 'standalone',
  envFiles: envFiles.map((file) => ({
    path: file,
    exists: existsSync(file),
  })),
  app: {
    name: config.app.name,
    publicOrigin: config.app.publicOrigin ?? '(request-derived)',
    publicBasePath: config.app.publicBasePath || '/',
    internalBasePath: config.app.internalBasePath,
    internalApiProxyPath: config.app.internalApiProxyPath || '(disabled)',
    publicApiUrl: config.app.publicApiUrl,
    nocoBaseApiUrl: formatOptionalUrl(config.app.nocoBaseApiUrl),
  },
  server: {
    host: config.server.host,
    port: config.server.port,
    startLog: config.server.startLog,
    viteDevUrl: formatOptionalUrl(config.server.viteDevUrl),
  },
  spa: {
    indexPath: config.spa.indexPath,
    indexExists: existsSync(config.spa.indexPath),
    runtime: config.spa.runtime,
  },
  logging: {
    default: activeLoggerName || '(none)',
    active: summarizeLogger(activeLogger),
  },
  caching: {
    default: activeCachingProviderName || '(none)',
    active: summarizeCachingProvider(activeCachingProvider),
  },
  database: {
    default: activeDatabaseName || '(none)',
    active: summarizeDatabaseConnection(activeDatabase),
    migrations: {
      directory: config.database.migrations.directory,
      directoryExists: existsSync(config.database.migrations.directory),
      autoRun: config.database.migrations.autoRun,
      tableName: config.database.migrations.tableName ?? '(default)',
      lockTableName: config.database.migrations.lockTableName ?? '(default)',
    },
    seeds: {
      directory: config.database.seeds?.directory ?? '(not configured)',
      directoryExists: config.database.seeds
        ? existsSync(config.database.seeds.directory)
        : false,
      autoRun: config.database.seeds?.autoRun ?? false,
      tableName: config.database.seeds?.tableName ?? '(default)',
      lockTableName: config.database.seeds?.lockTableName ?? '(default)',
    },
  },
  plugins: config.plugins.map((plugin) => ({
    packageName: plugin.packageName,
    version: plugin.version,
    enabled: plugin.enabled,
    migrationsDirectory: plugin.migrationsDirectory ?? '(none)',
    seedsDirectory: plugin.seedsDirectory ?? '(none)',
    routesEntry: plugin.routesEntry ?? '(none)',
  })),
  drive: {
    default: activeDriveName || '(none)',
    active: summarizeDriveDisk(activeDrive),
    links: config.drive.links,
  },
  queue: {
    default: activeQueueName || '(none)',
    active: summarizeQueueConnection(activeQueue),
    worker: {
      connection: config.queue.worker?.connection ?? '(default)',
      queues: config.queue.worker?.queues ?? [],
      concurrency: config.queue.worker?.concurrency ?? 1,
      idleDelay: String(config.queue.worker?.idleDelay ?? '2s'),
      timeout: config.queue.worker?.timeout
        ? String(config.queue.worker.timeout)
        : '(none)',
    },
    jobs: {
      locations: config.queue.jobs?.locations ?? [],
      autoLoad: config.queue.jobs?.autoLoad ?? true,
      hotReload: config.queue.jobs?.hotReload ?? false,
    },
  },
  session: {
    enabled: config.session.enabled ?? true,
    default: activeSessionName || '(none)',
    active: summarizeSessionStore(activeSession),
    cookie: {
      name: config.session.cookie.name,
      path: config.session.cookie.path ?? '/',
      domain: config.session.cookie.domain ?? '(current host)',
      secure: config.session.cookie.secure ?? false,
      httpOnly: config.session.cookie.httpOnly ?? true,
      sameSite: config.session.cookie.sameSite ?? 'lax',
      partitioned: config.session.cookie.partitioned ?? false,
      expireOnClose: config.session.cookie.expireOnClose ?? false,
    },
    lifetime: {
      absolute: String(config.session.lifetime.absolute),
      inactivity: config.session.lifetime.inactivity
        ? String(config.session.lifetime.inactivity)
        : '(none)',
      rolling: config.session.lifetime.rolling ?? true,
    },
    secret: config.session.secret ? '<configured>' : '(missing)',
    previousSecrets: config.session.previousSecrets?.length ?? 0,
    gcLottery: config.session.gcLottery ?? [2, 100],
  },
  notification: {
    test: {
      enabled: config.notification.test.enabled,
      emailRecipient: config.notification.test.emailRecipient
        ? '<configured>'
        : '(missing)',
    },
    channels: config.notification.channels.map((channel) => ({
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
    'Env files',
    value.envFiles
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
  printPair('Internal API proxy', value.app.internalApiProxyPath);
  printPair('Public API URL', value.app.publicApiUrl);
  printPair('Upstream NocoBase API', value.app.nocoBaseApiUrl);

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

function formatOptionalUrl(value: string | URL | undefined): string {
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
