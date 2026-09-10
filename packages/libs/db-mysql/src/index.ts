import { createRequire } from 'node:module';
import { RepositoryError } from '@nocobase/db';
import type {
  ConnectionConfig,
  DatabaseCapabilities,
  DatabaseDriverDefinition,
  MysqlConnectionConfig,
} from '@nocobase/db';
import { MysqlSchemaInspector } from './inspectors/mysql.js';
import { compileMysqlJsonCondition } from './json.js';

const require = createRequire(import.meta.url);
const Mysql2: unknown = require('mysql2') as unknown;
export type MysqlOptions = Omit<
  MysqlConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;
export const mysqlDriver: DatabaseDriverDefinition<'mysql'> = {
  dialect: 'mysql',
  packageName: '@nocobase/db-mysql',
  nativeDriver: 'mysql2',
  knexClient: 'mysql2',
  resolveKnexClient: () =>
    require('knex/lib/dialects/mysql2/index.js') as typeof import('knex').Knex.Client,
  capabilities: {
    comments: true,
    nativeTypes: true,
  } satisfies Partial<DatabaseCapabilities>,
  createRuntime: ({ dialect, capabilities }) => ({
    dialect,
    capabilities,
    numeric: {
      hasNativeResults: true,
      aggregateProjection: ({ expression }) => expression,
    },
    schema: {
      columnType: ({ column }) =>
        column.type === 'datetime' || column.type === 'datetimeTz'
          ? 'datetime(3)'
          : column.type === 'time'
            ? 'time(3)'
            : undefined,
    },
    repository: {
      compileJsonCondition: ({ client, column, node }) =>
        compileMysqlJsonCondition(client, column, node),
      encodeBoolean: (_field, value) => (value === null ? null : value ? 1 : 0),
      temporalBinding: ({ client, field, value }) => {
        const normalized = String(value);
        const instant = field.type === 'datetimeTz';
        const physical = normalized.replace('T', ' ').replace(/Z$/, '');
        if (
          instant &&
          /^timestamp(?:\(|$)/i.test(String(field.db?.nativeType))
        ) {
          if (
            normalized < '1970-01-01T00:00:01.000Z' ||
            normalized > '2038-01-19T03:14:07.000Z'
          )
            throw new RepositoryError(
              'INVALID_MUTATION',
              'Value exceeds the native MySQL TIMESTAMP range.',
            );
          return client.raw("convert_tz(?, '+00:00', @@session.time_zone)", [
            physical,
          ]);
        }
        return physical;
      },
      temporalProjection: ({ client, field, reference }) => {
        if (!field)
          return typeof reference === 'string'
            ? client.ref(reference)
            : reference;
        const instant = field.type === 'datetimeTz';
        const source =
          instant && /^timestamp(?:\(|$)/i.test(String(field.db?.nativeType))
            ? "convert_tz(??, @@session.time_zone, '+00:00')"
            : '??';
        const format =
          field.type === 'date'
            ? '%Y-%m-%d'
            : field.type === 'time'
              ? '%H:%i:%s.%f'
              : '%Y-%m-%dT%H:%i:%s.%f';
        const length =
          field.type === 'date' ? 10 : field.type === 'time' ? 12 : 23;
        const formatted = `left(date_format(${source}, ?), ${length})`;
        return client.raw(instant ? `concat(${formatted}, 'Z')` : formatted, [
          reference,
          format,
        ]);
      },
    },
  }),
  createKnexClient: (_config, baseClient) => {
    if (!baseClient) return 'mysql2';
    class MysqlClientWithDriver extends baseClient {
      _driver(): unknown {
        return Mysql2;
      }
    }
    return MysqlClientWithDriver;
  },
  resolveConnection: (source: ConnectionConfig) => {
    const config = source as MysqlConnectionConfig;
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
    return {
      connection: compactObject({
        ...config.driverOptions,
        supportBigNumbers: true,
        bigNumberStrings: true,
        decimalNumbers: false,
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        charset: config.charset,
        timezone: config.timezone,
        socketPath: config.socketPath,
        ssl: normalizeMysqlSsl(config.ssl),
      }),
    };
  },
  createSchemaInspector: (context) =>
    new MysqlSchemaInspector({
      connectionName: context.connectionName,
      resolveClient: context.resolveClient,
    }),
  normalizeConnection: (source) => {
    const config = source as MysqlConnectionConfig;
    return {
      ...(config.socketPath ? {} : { host: '127.0.0.1', port: 3306 }),
      database: 'app',
      username: 'root',
      password: '',
      charset: 'utf8mb4',
      ...config,
    };
  },
  resolveOwnershipTarget: (source) => {
    const config = source as MysqlConnectionConfig;
    return [
      'mysql',
      config.host,
      config.port,
      config.socketPath,
      config.database,
      undefined,
    ];
  },
};
export type MysqlConnection = MysqlOptions & {
  dialect: 'mysql';
  databaseDriver: typeof mysqlDriver;
};
export interface MysqlFactory {
  (options?: MysqlOptions): MysqlConnection;
  readonly dialect: 'mysql';
  readonly driver: typeof mysqlDriver;
}
export const mysql: MysqlFactory = Object.assign(
  (options: MysqlOptions = {}) => ({
    ...options,
    dialect: 'mysql' as const,
    driver: 'mysql2' as const,
    databaseDriver: mysqlDriver,
  }),
  { dialect: 'mysql' as const, driver: mysqlDriver },
);
export default mysql;

function assertSocketPathExclusive(
  config: { socketPath?: string },
  fields: readonly string[],
): void {
  if (!config.socketPath) return;
  const conflicts = fields.filter(
    (field) => (config as Record<string, unknown>)[field] !== undefined,
  );
  if (conflicts.length > 0) {
    throw new Error(
      `Database connection socketPath cannot be combined with ${conflicts.join(', ')}.`,
    );
  }
}

function assertDriverOptions(
  driverOptions: Record<string, unknown> | undefined,
  reservedKeys: readonly string[],
): void {
  if (!driverOptions) return;
  const reserved = reservedKeys.filter(
    (key) => driverOptions[key] !== undefined,
  );
  if (reserved.length > 0) {
    throw new Error(
      `Database driverOptions cannot include ${reserved.join(', ')}. Use flattened connection parameters.`,
    );
  }
}

function normalizeMysqlSsl(
  ssl: MysqlConnectionConfig['ssl'],
): boolean | Record<string, unknown> | undefined {
  return ssl === true ? {} : ssl;
}

function compactObject(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

export { mysqlTypes, mysqlNumeric } from './inspectors/mysql.js';
