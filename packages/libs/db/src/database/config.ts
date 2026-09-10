import type { NamingOptions } from '../collection/types.js';
import type { CollectionMetadataStore } from '../metadata/document-store.js';
import type { DatabaseCapabilities } from '../schema/adapter.js';
import type { Knex } from 'knex';
import type { SchemaInspector } from '../schema/inspector/types.js';

export interface DatabaseConfig {
  default?: string;
  /** Database drivers available to connections that use declarative configs. */
  drivers?: Record<string, DatabaseDriverDefinition>;
  connections: Record<string, ConnectionConfig>;
  metadataStore?: CollectionMetadataStore;
}

/**
 * A dialect package's public driver descriptor.  The implementation is
 * intentionally small in the first iteration; dialect-specific Knex hooks
 * can be added without changing the manager configuration shape.
 */
export interface DatabaseDriverDefinition<TDialect extends string = string> {
  readonly dialect: TDialect;
  readonly packageName?: string;
  readonly knexClient?: string;
  readonly createKnexClient?: (config: unknown) => string | typeof Knex.Client;
  readonly resolveConnection?: (config: ConnectionConfig) => {
    connection: unknown;
    searchPath?: string[];
    useNullAsDefault?: boolean;
  };
  readonly createSchemaInspector?: (context: {
    connectionName: string;
    config: unknown;
    resolveClient: () => Promise<Knex>;
  }) => SchemaInspector;
  readonly configurePool?: (
    config: unknown,
    pool: Knex.PoolConfig,
  ) => Knex.PoolConfig;
}

export type DatabaseDialect =
  'sqlite' | 'postgres' | 'mysql' | 'oracle' | 'mssql';

export type SchemaManagementMode = 'managed' | 'external';

export interface BaseConnectionConfig {
  naming?: NamingOptions;
  capabilities?: Partial<DatabaseCapabilities>;
  metadataStore?: CollectionMetadataStore;
  onCollectionMetadataInvalidationError?: (error: unknown) => void;
  schemaManagement?: SchemaManagementMode;
  debug?: boolean;
  pool?: unknown;
  driverOptions?: Record<string, unknown>;
  /** Driver supplied by a dialect factory (for example postgres({...})). */
  databaseDriver?: DatabaseDriverDefinition;
}

export interface SqliteConnectionConfig extends BaseConnectionConfig {
  dialect: 'sqlite';
  driver?: 'better-sqlite3';
  filename: string;
}

export type PostgresConnectionConfig = BaseConnectionConfig & {
  dialect: 'postgres';
  driver?: 'pg';
  schema?: string | readonly string[];
  ssl?: boolean | Record<string, unknown>;
} & HostConnectionConfig;

export type MysqlConnectionConfig = BaseConnectionConfig & {
  dialect: 'mysql';
  driver?: 'mysql2';
  charset?: string;
  timezone?: string;
  ssl?: boolean | Record<string, unknown>;
} & MysqlConnectionTargetConfig;

export type OracleConnectionConfig = BaseConnectionConfig & {
  dialect: 'oracle';
  driver?: 'oracledb';
  serviceName: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
};

export type MssqlConnectionConfig = BaseConnectionConfig & {
  dialect: 'mssql';
  driver?: 'tedious';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
};

export type ConnectionConfig =
  | SqliteConnectionConfig
  | PostgresConnectionConfig
  | MysqlConnectionConfig
  | OracleConnectionConfig
  | MssqlConnectionConfig;

export type DatabaseDriver = NonNullable<ConnectionConfig['driver']>;

type MysqlConnectionTargetConfig =
  (HostConnectionConfig & { socketPath?: never }) | SocketConnectionConfig;

interface HostConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

interface SocketConnectionConfig {
  host?: never;
  port?: never;
  socketPath: string;
  database?: string;
  username?: string;
  password?: string;
}

export function defineDatabase<T extends DatabaseConfig>(config: T): T {
  return config;
}
