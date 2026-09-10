import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  SqliteConnectionConfig,
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
};
export type SqliteConnection = Omit<ConnectionConfig, 'dialect'> &
  SqliteOptions & { dialect: 'sqlite'; databaseDriver: typeof sqliteDriver };
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
