import type {
  ConnectionConfig,
  DatabaseDriverDefinition,
  PostgresConnectionConfig,
} from '@nocobase/db';
import { PostgresSchemaInspector } from '@nocobase/db';

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
  createSchemaInspector: (context) => {
    const schema = (context.config as PostgresConnectionConfig).schema;
    return new PostgresSchemaInspector({
      connectionName: context.connectionName,
      searchPath:
        typeof schema === 'string'
          ? [schema]
          : schema
            ? [...schema]
            : undefined,
      resolveClient: context.resolveClient,
    });
  },
} satisfies DatabaseDriverDefinition<'postgres'>;

export type PostgresConnection = PostgresOptions & {
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
    ...options,
    dialect: 'postgres' as const,
    databaseDriver: postgresDriver,
  }),
  {
    dialect: 'postgres' as const,
    driver: postgresDriver,
  },
);

export default postgres;
