import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  MysqlConnectionConfig,
} from '@nocobase/db';
export type MysqlOptions = Omit<
  MysqlConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;
export const mysqlDriver: DatabaseDriverDefinition<'mysql'> = {
  dialect: 'mysql',
  packageName: '@nocobase/db-mysql',
  knexClient: 'mysql2',
  resolveConnection: (source: ConnectionConfig) => {
    const config = source as MysqlConnectionConfig;
    return {
      connection: {
        ...config.driverOptions,
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        charset: config.charset,
        timezone: config.timezone,
        socketPath: config.socketPath,
        ssl: config.ssl === true ? {} : config.ssl,
      },
    };
  },
};
export type MysqlConnection = Omit<ConnectionConfig, 'dialect'> &
  MysqlOptions & { dialect: 'mysql'; databaseDriver: typeof mysqlDriver };
export interface MysqlFactory {
  (options?: MysqlOptions): MysqlConnection;
  readonly dialect: 'mysql';
  readonly driver: typeof mysqlDriver;
}
export const mysql: MysqlFactory = Object.assign(
  (options: MysqlOptions = {}) => ({
    dialect: 'mysql' as const,
    databaseDriver: mysqlDriver,
    ...options,
  }),
  { dialect: 'mysql' as const, driver: mysqlDriver },
);
export default mysql;
