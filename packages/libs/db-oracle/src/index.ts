import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  OracleConnectionConfig,
} from '@nocobase/db';
import { OracleSchemaInspector } from '@nocobase/db';
export type OracleOptions = Omit<
  OracleConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;
export const oracleDriver: DatabaseDriverDefinition<'oracle'> = {
  dialect: 'oracle',
  packageName: '@nocobase/db-oracle',
  knexClient: 'oracledb',
  resolveConnection: (source: ConnectionConfig) => {
    const config = source as OracleConnectionConfig;
    return {
      connection: {
        ...config.driverOptions,
        user: config.username,
        password: config.password,
        connectString: `${config.host ?? '127.0.0.1'}:${config.port ?? 1521}/${config.serviceName}`,
      },
    };
  },
  createSchemaInspector: (context) =>
    new OracleSchemaInspector({
      connectionName: context.connectionName,
      resolveClient: context.resolveClient,
    }),
};
export type OracleConnection = OracleOptions & {
  dialect: 'oracle';
  databaseDriver: typeof oracleDriver;
};
export interface OracleFactory {
  (options?: OracleOptions): OracleConnection;
  readonly dialect: 'oracle';
  readonly driver: typeof oracleDriver;
}
export const oracle: OracleFactory = Object.assign(
  (options: OracleOptions = { serviceName: 'FREEPDB1' }) => ({
    dialect: 'oracle' as const,
    databaseDriver: oracleDriver,
    ...options,
  }),
  { dialect: 'oracle' as const, driver: oracleDriver },
);
export default oracle;
