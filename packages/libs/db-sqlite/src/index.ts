import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  SqliteConnectionConfig,
} from '@nocobase/db';
import {
  installDecimalAggregates,
  preciseIntegerClient,
  SqliteSchemaInspector,
} from '@nocobase/db';
export type SqliteOptions = Omit<
  SqliteConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;
export const sqliteDriver: DatabaseDriverDefinition<'sqlite'> = {
  dialect: 'sqlite',
  packageName: '@nocobase/db-sqlite',
  knexClient: 'better-sqlite3',
  resolveConnection: (source: ConnectionConfig) => {
    const config = source as SqliteConnectionConfig;
    return {
      connection: { ...config.driverOptions, filename: config.filename },
      useNullAsDefault: true,
    };
  },
  createSchemaInspector: (context) =>
    new SqliteSchemaInspector({
      connectionName: context.connectionName,
      resolveClient: context.resolveClient,
    }),
  createKnexClient: () => preciseIntegerClient('sqlite', 'better-sqlite3'),
  configurePool: (_config, pool) => {
    const afterCreate = pool.afterCreate;
    return {
      ...pool,
      afterCreate: (
        connection: Parameters<typeof installDecimalAggregates>[0],
        done: (error: unknown, connection?: unknown) => void,
      ) => {
        try {
          installDecimalAggregates(connection);
          if (afterCreate) {
            (
              afterCreate as unknown as (
                connection: unknown,
                done: (error: unknown, connection?: unknown) => void,
              ) => void
            )(connection, done);
          } else done(null, connection);
        } catch (error) {
          done(error);
        }
      },
    };
  },
};
export type SqliteConnection = SqliteOptions & {
  dialect: 'sqlite';
  databaseDriver: typeof sqliteDriver;
};
export interface SqliteFactory {
  (options?: SqliteOptions): SqliteConnection;
  readonly dialect: 'sqlite';
  readonly driver: typeof sqliteDriver;
}
export const sqlite: SqliteFactory = Object.assign(
  (options: SqliteOptions = { filename: ':memory:' }) => ({
    dialect: 'sqlite' as const,
    databaseDriver: sqliteDriver,
    ...options,
  }),
  { dialect: 'sqlite' as const, driver: sqliteDriver },
);
export default sqlite;
