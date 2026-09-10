import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  PostgresConnectionConfig,
} from '@nocobase/db';

export type PostgresOptions = Omit<
  PostgresConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;

export const postgresDriver: DatabaseDriverDefinition<'postgres'> = {
  dialect: 'postgres',
  packageName: '@nocobase/db-postgres',
  knexClient: 'pg',
  resolveConnection: (
    source: ConnectionConfig,
  ): {
    connection: unknown;
    searchPath?: string[];
    useNullAsDefault?: boolean;
  } => {
    const config = source as PostgresConnectionConfig;
    return {
      connection: {
        ...config.driverOptions,
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl,
      },
      searchPath:
        config.schema === undefined
          ? undefined
          : typeof config.schema === 'string'
            ? [config.schema]
            : [...config.schema],
    };
  },
} satisfies DatabaseDriverDefinition<'postgres'>;

export type PostgresConnection = Omit<ConnectionConfig, 'dialect'> &
  PostgresOptions & {
    dialect: 'postgres';
    databaseDriver: typeof postgresDriver;
  };

export interface PostgresFactory {
  (options?: PostgresOptions): PostgresConnection;
  readonly dialect: 'postgres';
  readonly driver: typeof postgresDriver;
}

export const postgres: PostgresFactory = Object.assign(
  (options: PostgresOptions = {}) => ({
    dialect: 'postgres' as const,
    databaseDriver: postgresDriver,
    ...options,
  }),
  {
    dialect: 'postgres' as const,
    driver: postgresDriver,
  },
);

export default postgres;
