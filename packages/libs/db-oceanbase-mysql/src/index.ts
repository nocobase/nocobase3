import { createRequire } from 'node:module';
import { RepositoryError } from '@nocobase/db';
import type {
  ConnectionConfig,
  DatabaseCapabilities,
  DatabaseDriverDefinition,
  MysqlConnectionConfig,
} from '@nocobase/db';
import { rawRows } from '@nocobase/db';
import { MysqlSchemaInspector } from './inspectors/mysql.js';
import { compileMysqlJsonCondition } from './json.js';

const require = createRequire(import.meta.url);
const Mysql2: unknown = require('mysql2') as unknown;
export type OceanbaseMysqlOptions = Omit<
  MysqlConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;
export const oceanbaseMysqlDriver: DatabaseDriverDefinition<'oceanbase-mysql'> =
  {
    dialect: 'oceanbase-mysql',
    packageName: '@nocobase/db-oceanbase-mysql',
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
        enumGroupKey: ({ client, field }) => client.raw('binary ??', [field]),
        compileFilterCondition: ({ query, node, field, name, boolean }) => {
          if (
            field?.type === 'enum' &&
            typeof node.value === 'string' &&
            (node.operator === '$eq' || node.operator === '$ne')
          ) {
            query[boolean === 'or' ? 'orWhereRaw' : 'whereRaw'](
              `binary ?? ${node.operator === '$eq' ? '=' : '<>'} binary ?`,
              [name, node.value],
            );
            return { handled: true };
          }
          return { handled: false };
        },
        compileJsonCondition: ({ client, column, node }) =>
          compileMysqlJsonCondition(client, column, node),
        encodeBoolean: (_field, value) =>
          value === null ? null : value ? 1 : 0,
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
        numericMutation: ({ client, field, name, operation, operand }) => {
          if (
            field?.type !== 'integer' &&
            field?.type !== 'bigInt' &&
            field?.type !== 'decimal'
          )
            return undefined;
          const text = String(operand);
          const operator = (
            {
              increment: '+',
              decrement: '-',
              multiply: '*',
              divide: '/',
            } as Record<string, string>
          )[operation];
          if (!operator) return undefined;
          if (field.type === 'bigInt' || field.type === 'integer')
            return client.raw(`?? ${operator} cast(? as signed)`, [name, text]);
          const precision = field.precision ?? 65;
          const scale = field.scale ?? 30;
          if (precision > 65 || scale > 30 || scale > precision)
            throw new RepositoryError(
              'INVALID_MUTATION',
              'Numeric operand exceeds the database decimal precision.',
            );
          return client.raw(
            `?? ${operator} cast(? as decimal(${precision}, ${scale}))`,
            [name, text],
          );
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
        ...(config.socketPath ? {} : { host: '127.0.0.1', port: 2881 }),
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
        'oceanbase-mysql',
        config.host,
        config.port,
        config.socketPath,
        config.database,
        undefined,
      ];
    },
    resetManagedSchema: async (context) => {
      const config = context.config as MysqlConnectionConfig;
      const client = await context.resolveClient();
      const database =
        config.database ??
        rawRows<{ database: string }>(
          await client.raw('select database() as database'),
        )[0]?.database;
      if (!database)
        throw new Error('MySQL connection has no selected database.');
      const rows = rawRows<{
        table_name?: string;
        table_type?: string;
        TABLE_NAME?: string;
        TABLE_TYPE?: string;
      }>(
        await client.raw(
          `select table_name, table_type
         from information_schema.tables
         where table_schema = ?
         order by case table_type when 'VIEW' then 0 else 1 end, table_name`,
          [database],
        ),
      );
      const foreignKeyChecks = rawRows<{ value: number | string }>(
        await client.raw('select @@session.foreign_key_checks as value'),
      )[0]?.value;
      if (foreignKeyChecks === undefined) {
        throw new Error('MySQL connection did not return foreign_key_checks.');
      }
      await client.raw('set foreign_key_checks = 0');
      try {
        for (const row of rows) {
          const tableName = row.table_name ?? row.TABLE_NAME;
          const tableType = row.table_type ?? row.TABLE_TYPE;
          if (!tableName) continue;
          const kind = tableType === 'VIEW' ? 'view' : 'table';
          await client.raw(`drop ${kind} if exists ${quoteMysql(tableName)}`);
        }
      } finally {
        await client.raw(
          `set foreign_key_checks = ${Number(foreignKeyChecks) === 0 ? 0 : 1}`,
        );
      }
    },
  };
export type OceanbaseMysqlConnection = OceanbaseMysqlOptions & {
  dialect: 'oceanbase-mysql';
  databaseDriver: typeof oceanbaseMysqlDriver;
};
export interface OceanbaseMysqlFactory {
  (options?: OceanbaseMysqlOptions): OceanbaseMysqlConnection;
  readonly dialect: 'oceanbase-mysql';
  readonly driver: typeof oceanbaseMysqlDriver;
}
export const oceanbaseMysql: OceanbaseMysqlFactory = Object.assign(
  (options: OceanbaseMysqlOptions = {}) => ({
    ...options,
    dialect: 'oceanbase-mysql' as const,
    driver: 'mysql2' as const,
    databaseDriver: oceanbaseMysqlDriver,
  }),
  { dialect: 'oceanbase-mysql' as const, driver: oceanbaseMysqlDriver },
);
export default oceanbaseMysql;

function quoteMysql(identifier: string): string {
  return `\`${identifier.replaceAll('`', '``')}\``;
}

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
