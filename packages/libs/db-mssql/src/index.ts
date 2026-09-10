import { createRequire } from 'node:module';
import { RepositoryError } from '@nocobase/db';
import type {
  ConnectionConfig,
  DatabaseCapabilities,
  DatabaseDriverDefinition,
  MssqlConnectionConfig,
} from '@nocobase/db';
import { MssqlSchemaInspector } from './inspectors/mssql.js';

const require = createRequire(import.meta.url);
const Tedious: unknown = require('tedious') as unknown;
export type MssqlOptions = Omit<
  MssqlConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;
export const mssqlDriver: DatabaseDriverDefinition<'mssql'> = {
  dialect: 'mssql',
  packageName: '@nocobase/db-mssql',
  nativeDriver: 'tedious',
  knexClient: 'mssql',
  capabilities: {
    schemas: true,
    partialIndexes: true,
    nativeTypes: true,
    comments: true,
  } satisfies Partial<DatabaseCapabilities>,
  createRuntime: ({ dialect, capabilities }) => ({
    dialect,
    capabilities,
    numeric: {
      aggregateSql: ({ client, kind, field, distinct, source }) => {
        const operand = field === '*' ? client.raw('*') : client.ref(field);
        const prefix = distinct ? 'distinct ' : '';
        if (kind === 'count') {
          return client.raw(`count_big(${prefix}?)`, [operand]);
        }
        const floating = source && ['float', 'double'].includes(source.type);
        if (!floating && (kind === 'avg' || kind === 'sum')) {
          if (source?.type === 'decimal') {
            return client.raw(`${kind}(${prefix}?)`, [operand]);
          }
          return client.raw(`${kind}(${prefix}cast(? as decimal(38,0)))`, [
            operand,
          ]);
        }
        return client.raw(`${kind}(${prefix}?)`, [operand]);
      },
      aggregateProjection: ({ client, expression }) =>
        client.raw('cast(? as varchar(max))', [expression]),
    },
    repository: {
      encodeBoolean: (_field, value) =>
        value === null ? null : Boolean(value),
      reloadReturnedDecimal: true,
      encodeBlobNull: (client) => client.raw('cast(null as varbinary(max))'),
      escapeLikePattern: (value) =>
        value.replace(/[%_[]/g, (char) => `\\${char}`),
      numericMutation: ({ client, field, name, operation, operand }) => {
        const integral = field?.type === 'integer' || field?.type === 'bigInt';
        if (!integral && field?.type !== 'decimal') return undefined;
        const text = String(operand);
        const match = text.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
        if (!match || !(match[2] || match[3])) return undefined;
        const scale = Math.max(
          0,
          (match[3]?.length ?? 0) - Number(match[4] ?? 0),
        );
        const digits =
          (match[2] + (match[3] ?? '')).replace(/^0+(?=\d)/, '').length || 1;
        const precision = Math.max(digits, scale, 1);
        if (precision > 38 || scale > 38)
          throw new RepositoryError(
            'INVALID_MUTATION',
            'Numeric operand exceeds the database decimal precision.',
          );
        const operator = (
          {
            increment: '+',
            decrement: '-',
            multiply: '*',
            divide: '/',
          } as Record<string, string>
        )[operation];
        return client.raw(
          `?? ${operator} cast(? as decimal(${precision}, ${scale}))`,
          [name, text],
        );
      },
      temporalBinding: ({ client, field, value }) => {
        const normalized = String(value);
        const native = String(field.db?.nativeType).toLowerCase();
        if (
          native === 'smalldatetime' &&
          (normalized < '1900-01-01T00:00:00.000' ||
            normalized > '2079-06-06T23:59:00.000' ||
            !normalized.endsWith(':00.000'))
        )
          throw new RepositoryError(
            'INVALID_MUTATION',
            'SMALLDATETIME requires a value in its native range with minute precision.',
          );
        if (
          native === 'datetime' &&
          (normalized < '1753-01-01T00:00:00.000' ||
            normalized > '9999-12-31T23:59:59.997')
        )
          throw new RepositoryError(
            'INVALID_MUTATION',
            'Value exceeds the native SQL Server DATETIME range.',
          );
        if (native === 'datetime' && !/[037]$/.test(normalized))
          throw new RepositoryError(
            'INVALID_MUTATION',
            'SQL Server DATETIME requires milliseconds ending in 0, 3, or 7 to avoid rounding.',
          );
        const type = (
          {
            date: 'date',
            time: 'time(3)',
            datetime: 'datetime2(3)',
            datetimeTz: 'datetimeoffset(3)',
          } as Record<string, string>
        )[field.type];
        return client.raw(`cast(? as ${type})`, [normalized]);
      },
      temporalProjection: ({ client, field, reference }) => {
        if (!field)
          return typeof reference === 'string'
            ? client.ref(reference)
            : reference;
        if (field.type === 'date')
          return client.raw('convert(varchar(10), ??, 23)', [reference]);
        if (field.type === 'time')
          return client.raw('convert(varchar(12), cast(?? as time(3)), 114)', [
            reference,
          ]);
        const instant = field.type === 'datetimeTz';
        return client.raw(
          instant
            ? "replace(convert(varchar(23), cast(switchoffset(??, '+00:00') as datetime2(3)), 121), ' ', 'T') + 'Z'"
            : "replace(convert(varchar(23), cast(?? as datetime2(3)), 121), ' ', 'T')",
          [reference],
        );
      },
    },
  }),
  createKnexClient: (_config, baseClient) => {
    if (!baseClient) return 'mssql';
    class MssqlClientWithDriver extends baseClient {
      _driver(): unknown {
        return Tedious;
      }
    }
    return MssqlClientWithDriver;
  },
  resolveConnection: (source: ConnectionConfig) => {
    const config = source as MssqlConnectionConfig;
    assertDriverOptions(config.driverOptions, [
      'host',
      'server',
      'port',
      'database',
      'user',
      'userName',
      'username',
      'password',
      'encrypt',
      'trustServerCertificate',
      'options',
      'pool',
      'url',
      'connectionString',
      'uri',
    ]);
    return {
      connection: compactObject({
        ...config.driverOptions,
        server: config.host ?? '127.0.0.1',
        port: config.port ?? 1433,
        database: config.database,
        user: config.username,
        password: config.password,
        encrypt: config.encrypt ?? false,
        options: {
          lowerCaseGuids: true,
          trustServerCertificate: config.trustServerCertificate ?? false,
        },
      }),
    };
  },
  createSchemaInspector: (context) =>
    new MssqlSchemaInspector({
      connectionName: context.connectionName,
      resolveClient: context.resolveClient,
    }),
};
export type MssqlConnection = MssqlOptions & {
  dialect: 'mssql';
  databaseDriver: typeof mssqlDriver;
};
export interface MssqlFactory {
  (options?: MssqlOptions): MssqlConnection;
  readonly dialect: 'mssql';
  readonly driver: typeof mssqlDriver;
}
export const mssql: MssqlFactory = Object.assign(
  (options: MssqlOptions = {}) => ({
    ...options,
    dialect: 'mssql' as const,
    driver: 'tedious' as const,
    databaseDriver: mssqlDriver,
  }),
  { dialect: 'mssql' as const, driver: mssqlDriver },
);
export default mssql;

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

function compactObject(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
