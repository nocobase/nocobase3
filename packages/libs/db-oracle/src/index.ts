import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  OracleConnectionConfig,
} from '@nocobase/db';
import { OracleSchemaInspector, preciseIntegerClient } from '@nocobase/db';
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
  createKnexClient: () =>
    // Oracle's integer codecs are installed by the shared Knex helper.
    // The package owns the hook, so core no longer needs an oracle branch.
    preciseIntegerClient('oracle', 'oracledb'),
  configurePool: (_config, pool) => {
    const configuredAfterCreate = pool.afterCreate;
    return {
      ...pool,
      afterCreate: (
        connection: { execute(sql: string): Promise<unknown> },
        done: (error: unknown, connection?: unknown) => void,
      ) => {
        Promise.all([
          connection.execute(
            `alter session set nls_date_format = 'YYYY-MM-DD HH24:MI:SS'`,
          ),
          connection.execute(
            `alter session set nls_timestamp_format = 'YYYY-MM-DD HH24:MI:SS'`,
          ),
        ])
          .then(() => {
            if (configuredAfterCreate) {
              (
                configuredAfterCreate as unknown as (
                  connection: unknown,
                  done: (error: unknown, connection?: unknown) => void,
                ) => void
              )(connection, done);
            } else done(null, connection);
          })
          .catch((error: unknown) => done(error));
      },
    };
  },
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
