import type { NamingOptions } from '../collection/types.js';
import type { CollectionMetadataStore } from '../metadata/document-store.js';
import type { DatabaseCapabilities } from '../schema/adapter.js';
import type { Knex } from 'knex';
import type { SchemaInspector } from '../schema/inspector/types.js';
import type { DatabaseDriverRuntimeFactory } from './runtime.js';

export interface DatabaseConfig {
  default?: string;
  /** Database drivers available to connections that use declarative configs. */
  drivers?: Record<string, DatabaseDriverRegistration>;
  connections: Record<string, ConnectionConfig>;
  metadataStore?: CollectionMetadataStore;
}

/**
 * Configuration shape for a database that contributes a dialect unknown to
 * this package. The connection type is inferred from the caller, so a new
 * dialect package can add its own options without extending this union.
 */
export interface ExtensibleDatabaseConfig<
  TConnection extends BaseConnectionConfig & { dialect: string } =
    BaseConnectionConfig & {
      dialect: string;
    },
> {
  default?: string;
  drivers?: Record<string, DatabaseDriverRegistration>;
  connections: Record<string, TConnection>;
  metadataStore?: CollectionMetadataStore;
}

/**
 * A Dialect package's public driver descriptor. Core owns orchestration while
 * the descriptor owns native-driver, Knex, SQL, value, Inspector, and
 * application-composition behavior for one Dialect.
 */
export interface DatabaseDriverDefinition<TDialect extends string = string> {
  readonly dialect: TDialect;
  readonly packageName?: string;
  /** Native driver package name owned by the dialect package. */
  readonly nativeDriver?: string;
  readonly knexClient?: string;
  /** Resolves the base Knex dialect class without core dialect knowledge. */
  readonly resolveKnexClient?: () => typeof Knex.Client;
  /** Capabilities supplied by the dialect package for this connection. */
  readonly capabilities?: Partial<DatabaseCapabilities>;
  /** Creates the runtime strategy object used by the core adapters. */
  readonly createRuntime?: DatabaseDriverRuntimeFactory;
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
  /**
   * Applies application-level defaults and path normalization owned by the
   * dialect package. The core database manager only consumes the resulting
   * connection and never needs to know dialect-specific defaults.
   */
  readonly normalizeConnection?: (
    config: unknown,
    context: {
      resolveStoragePath?: (filename: string) => string;
    },
  ) => unknown;
  /**
   * Returns a stable identity for managed-database ownership checks. Drivers
   * may return `undefined` for connections that do not have a local target
   * (for example an in-memory database).
   */
  readonly resolveOwnershipTarget?: (
    config: unknown,
  ) => readonly unknown[] | undefined;
  /**
   * Clears the objects owned by a managed connection while preserving the
   * database and its target schema. Used by the explicit destructive
   * migration reset command.
   */
  readonly resetManagedSchema?: (context: {
    connectionName: string;
    config: unknown;
    resolveClient: () => Promise<Knex>;
  }) => void | Promise<void>;
  /**
   * Prepares any local storage required before a connection is opened.
   * Application hosts provide the filesystem operation; drivers own the
   * decision about whether it is needed.
   */
  readonly prepareStorage?: (
    config: unknown,
    context: {
      ensureDirectory: (directory: string) => Promise<void>;
    },
  ) => void | Promise<void>;
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

/**
 * Dialect identifiers are open ended. Built-in connection config aliases below
 * provide strict fields for the shipped drivers, while new driver packages can
 * contribute their own dialect literal without changing this package.
 */
export type DatabaseDialect = string;

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

export function defineDatabase<
  T extends DatabaseConfig | ExtensibleDatabaseConfig<any>,
>(config: T): T {
  return config;
}
