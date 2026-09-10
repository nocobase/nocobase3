import type { NamingOptions } from '../collection/types.js';
import type { CollectionMetadataStore } from '../metadata/document-store.js';
import type { DatabaseCapabilities } from '../schema/adapter.js';
import type { Knex } from 'knex';
import type { SchemaInspector } from '../schema/inspector/types.js';

export interface DatabaseConfig {
  default?: string;
  /** Database drivers available to connections that use declarative configs. */
  drivers?: Record<string, DatabaseDriverRegistration>;
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
  /** Native driver package name owned by the dialect package. */
  readonly nativeDriver?: string;
  readonly knexClient?: string;
  /** Capabilities supplied by the dialect package for this connection. */
  readonly capabilities?: Partial<DatabaseCapabilities>;
  readonly createKnexClient?: (
    config: unknown,
    baseClient?: typeof Knex.Client,
  ) => string | typeof Knex.Client;
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

/**
 * Factory exported by a dialect package.  A factory returns a connection
 * config with the package's driver already attached, while its `.driver`
 * property is the descriptor used by declarative registrations.
 */
export interface DatabaseDriverFactory<
  TDialect extends string = string,
  TOptions extends object = any,
> {
  (options?: TOptions): BaseConnectionConfig & {
    dialect: TDialect;
    databaseDriver: DatabaseDriverDefinition<TDialect>;
  };
  readonly dialect: TDialect;
  readonly driver: DatabaseDriverDefinition<TDialect>;
}

export type DatabaseDriverRegistration<TDialect extends string = string> =
  DatabaseDriverDefinition<TDialect> | DatabaseDriverFactory<TDialect>;

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
  driver?: string;
  filename: string;
}

export type PostgresConnectionConfig = BaseConnectionConfig & {
  dialect: 'postgres';
  driver?: string;
  schema?: string | readonly string[];
  ssl?: boolean | Record<string, unknown>;
} & HostConnectionConfig;

export type MysqlConnectionConfig = BaseConnectionConfig & {
  dialect: 'mysql';
  driver?: string;
  charset?: string;
  timezone?: string;
  ssl?: boolean | Record<string, unknown>;
} & MysqlConnectionTargetConfig;

export type OracleConnectionConfig = BaseConnectionConfig & {
  dialect: 'oracle';
  driver?: string;
  serviceName: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
};

export type MssqlConnectionConfig = BaseConnectionConfig & {
  dialect: 'mssql';
  driver?: string;
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

/** Native driver identifier supplied by a dialect package. */
export type DatabaseDriver = string;

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
