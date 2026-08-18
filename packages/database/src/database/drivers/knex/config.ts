import type {
  BaseConnectionConfig,
  ConnectionConfig,
  DatabaseDialect,
  DatabaseDriver,
  MysqlConnectionConfig,
  PostgresConnectionConfig,
  SqliteConnectionConfig,
} from '../../config.js';

export interface KnexConnectionConfig extends BaseConnectionConfig {
  dialect: DatabaseDialect;
  driver: DatabaseDriver;
  knexClient: DatabaseDriver;
  connection?: unknown;
  useNullAsDefault?: boolean;
  searchPath?: string[];
}

const DEFAULT_DRIVER_BY_DIALECT = {
  sqlite: 'better-sqlite3',
  postgres: 'pg',
  mysql: 'mysql2',
} as const satisfies Record<DatabaseDialect, DatabaseDriver>;

export function resolveKnexConnectionConfig(config: ConnectionConfig): KnexConnectionConfig {
  assertNoUnsupportedConnectionConfigFields(config);
  const driver = resolveDatabaseDriver(config);

  return {
    ...config,
    driver,
    knexClient: driver,
    connection: resolveKnexConnection(config),
    useNullAsDefault: config.dialect === 'sqlite' ? true : undefined,
    searchPath: config.dialect === 'postgres' ? normalizeSearchPath(config.schema) : undefined,
  };
}

export function resolveDatabaseDriver(config: Pick<ConnectionConfig, 'dialect' | 'driver'>): DatabaseDriver {
  const defaultDriver = defaultDriverForDialect(config.dialect);
  const driver = config.driver ?? defaultDriver;
  if (driver !== defaultDriver) {
    throw new Error(`Invalid database driver "${driver}" for dialect "${config.dialect}". Expected "${defaultDriver}".`);
  }
  return driver;
}

function defaultDriverForDialect(dialect: unknown): DatabaseDriver {
  const driver = DEFAULT_DRIVER_BY_DIALECT[dialect as DatabaseDialect];
  if (!driver) {
    throw new Error(`Invalid database dialect "${String(dialect)}". Expected "sqlite", "postgres", or "mysql".`);
  }
  return driver;
}

function resolveKnexConnection(config: ConnectionConfig): unknown {
  switch (config.dialect) {
    case 'sqlite':
      return resolveSqliteConnection(config);
    case 'postgres':
      return resolvePostgresConnection(config);
    case 'mysql':
      return resolveMysqlConnection(config);
    default:
      return assertNever(config);
  }
}

function resolveSqliteConnection(config: SqliteConnectionConfig): Record<string, unknown> {
  assertDriverOptions(config.driverOptions, ['filename', 'pool', 'url', 'connectionString', 'uri']);

  return compactObject({
    ...config.driverOptions,
    filename: config.filename,
  });
}

function resolvePostgresConnection(config: PostgresConnectionConfig): Record<string, unknown> {
  assertDriverOptions(config.driverOptions, [
    'host',
    'port',
    'database',
    'user',
    'username',
    'password',
    'ssl',
    'pool',
    'url',
    'connectionString',
    'uri',
  ]);

  return compactObject({
    ...config.driverOptions,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl,
  });
}

function resolveMysqlConnection(config: MysqlConnectionConfig): Record<string, unknown> {
  assertSocketPathExclusive(config, ['host', 'port']);
  assertDriverOptions(config.driverOptions, [
    'host',
    'port',
    'database',
    'user',
    'username',
    'password',
    'charset',
    'timezone',
    'socketPath',
    'ssl',
    'pool',
    'url',
    'connectionString',
    'uri',
  ]);

  return compactObject({
    ...config.driverOptions,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    charset: config.charset,
    timezone: config.timezone,
    socketPath: config.socketPath,
    ssl: normalizeMysqlSsl(config.ssl),
  });
}

function normalizeSearchPath(schema: PostgresConnectionConfig['schema']): string[] | undefined {
  if (schema === undefined) {
    return undefined;
  }
  return typeof schema === 'string' ? [schema] : [...schema];
}

function assertNoUnsupportedConnectionConfigFields(config: ConnectionConfig): void {
  const unsupportedFields = ['adapter', 'client', 'connection', 'url', 'connectionString', 'uri'];
  const fields = unsupportedFields.filter((field) => (
    config as unknown as Record<string, unknown>
  )[field] !== undefined);
  if (fields.length > 0) {
    throw new Error(`Database connection config cannot include ${fields.join(', ')}. Use dialect and flattened connection parameters.`);
  }
}

function assertSocketPathExclusive(config: { socketPath?: string }, fields: readonly string[]): void {
  if (!config.socketPath) {
    return;
  }

  const conflicts = fields.filter((field) => (config as Record<string, unknown>)[field] !== undefined);
  if (conflicts.length > 0) {
    throw new Error(`Database connection socketPath cannot be combined with ${conflicts.join(', ')}.`);
  }
}

function assertDriverOptions(
  driverOptions: Record<string, unknown> | undefined,
  reservedKeys: readonly string[],
): void {
  if (!driverOptions) {
    return;
  }

  const reserved = reservedKeys.filter((key) => driverOptions[key] !== undefined);
  if (reserved.length > 0) {
    throw new Error(`Database driverOptions cannot include ${reserved.join(', ')}. Use flattened connection parameters.`);
  }
}

function normalizeMysqlSsl(ssl: MysqlConnectionConfig['ssl']): boolean | Record<string, unknown> | undefined {
  return ssl === true ? {} : ssl;
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function assertNever(value: never): never {
  throw new Error(`Unsupported database connection config: ${JSON.stringify(value)}`);
}
