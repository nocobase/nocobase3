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
    return {
      connection: {
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
      },
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
    dialect: 'mssql' as const,
    databaseDriver: mssqlDriver,
    ...options,
  }),
  { dialect: 'mssql' as const, driver: mssqlDriver },
);
export default mssql;
