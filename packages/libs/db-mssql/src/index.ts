import { createRequire } from 'node:module';
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
