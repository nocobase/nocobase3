import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  MssqlConnectionConfig,
} from '@nocobase/db';
import { MssqlSchemaInspector } from '@nocobase/db';
export type MssqlOptions = Omit<
  MssqlConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;
export const mssqlDriver: DatabaseDriverDefinition<'mssql'> = {
  dialect: 'mssql',
  packageName: '@nocobase/db-mssql',
  knexClient: 'mssql',
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
