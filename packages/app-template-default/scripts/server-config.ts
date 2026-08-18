import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadStandaloneAppConfig } from '../server/runtime/config.ts';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type ObjectValue = Record<string, unknown>;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFiles = [path.join(rootDir, '.env'), path.join(rootDir, '.env.local')];
const standaloneModuleUrl = new URL('../server/standalone.ts', import.meta.url).href;

const config = loadStandaloneAppConfig(standaloneModuleUrl);

const activeDatabaseName = config.database.default;
const databaseConnections: Record<string, unknown> = config.database.connections;
const activeDatabase =
  activeDatabaseName ? databaseConnections[activeDatabaseName] : undefined;
const report = {
  mode: 'standalone',
  envFiles: envFiles.map((file) => ({
    path: file,
    exists: existsSync(file),
  })),
  app: {
    name: config.app.name,
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
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      summary[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      summary[key] = value;
    }
  }

  return summary;
}

function printReport(value: typeof report): void {
  printSection('Server mode');
  printPair('Mode', value.mode);
  printPair(
    'Env files',
    value.envFiles.map((file) => `${path.relative(rootDir, file.path)}:${file.exists ? 'found' : 'missing'}`).join(', '),
  );

  printSection('App routing');
  printPair('App name', value.app.name);
  printPair('Public base path', value.app.publicBasePath);
  printPair('Internal base path', value.app.internalBasePath || '(app-local root)');
  printPair('Internal API proxy', value.app.internalApiProxyPath);
  printPair('Public API URL', value.app.publicApiUrl);
  printPair('Upstream NocoBase API', value.app.nocoBaseApiUrl);

  printSection('HTTP server');
  printPair('Host', value.server.host);
  printPair('Port', String(value.server.port));
  printPair('Startup log', String(value.server.startLog));
  printPair('Vite dev proxy', value.server.viteDevUrl);

  printSection('SPA runtime');
  printPair('Index path', `${value.spa.indexPath} (${value.spa.indexExists ? 'exists' : 'missing'})`);
  printPair('Storage prefix', value.spa.runtime.storagePrefix);
  printPair('Storage type', value.spa.runtime.storageType);
  printPair('Share token', String(value.spa.runtime.shareToken));

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

  printSection('Useful checks');
  printPair('Server-focused tests', 'pnpm test -- tests/logic/app-server.test.ts tests/logic/database-config.test.ts');
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
