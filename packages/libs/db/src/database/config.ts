import type { Knex } from 'knex';

import type { NamingOptions } from '../collection/types.js';
import type { CollectionMetadataStore } from '../metadata/document-store.js';
import type { DatabaseCapabilities } from '../schema/adapter.js';
import type { SchemaInspector } from '../schema/inspector/types.js';
import type { DatabaseDriverRuntimeFactory } from './runtime.js';

/**
 * Declarative form of a Collection metadata store, for configuration that
 * cannot carry an instance — a YAML file, or a literal in a test. The Manager
 * resolves it once when the connection is first created.
 */
export interface DirectoryCollectionMetadataStoreConfig {
  readonly type: 'directory';
  /** Absolute path; a relative path resolves against the process working directory, so resolve it first. */
  readonly directory: string;
}

export type CollectionMetadataStoreConfig =
  DirectoryCollectionMetadataStoreConfig;

/**
 * Any connection, whichever dialect declares it. The constraint every
 * connection-shaped type parameter in this package is written against.
 */
export type AnyConnectionConfig = BaseConnectionConfig & { dialect: string };

/**
 * Configuration shape for a database, over the connections it accepts.
 *
 * The parameter is what lets a dialect package contribute its own connection
 * options without this package extending a union for it. `DatabaseConfig` is
 * the same shape closed over the dialects declared here.
 */
export interface ExtensibleDatabaseConfig<
  TConnection extends AnyConnectionConfig = AnyConnectionConfig,
> {
  default?: string;
  /** Database drivers available to connections that use declarative configs. */
  drivers?: Record<string, DatabaseDriverRegistration>;
  connections: Record<string, TConnection>;
  metadataStore?: CollectionMetadataStore | CollectionMetadataStoreConfig;
}

/**
 * Configuration over the dialects this package declares a connection type for.
 *
 * An alias rather than a second interface: the two were written out separately
 * and stayed field-for-field identical, which left every consumer choosing
 * between two names for one shape — and `AppDatabaseConfig` in
 * `@nocobase/app-server` chose the closed one, which is why an application
 * could not configure a dialect a package contributed.
 */
export type DatabaseConfig = ExtensibleDatabaseConfig<ConnectionConfig>;

/**
 * A Dialect package's public driver descriptor. Core owns orchestration while
 * the descriptor owns native-driver, Knex, SQL, value, Inspector, and
 * application-composition behavior for one Dialect.
 *
 * The hooks are methods rather than function properties on purpose: TypeScript
 * checks method parameters bivariantly, which is what lets a driver narrowed to
 * its own connection type sit in the heterogeneous `drivers` map. What that
 * gives up is a pairing the runtime enforces anyway — `resolveConnectionDriver`
 * finds a driver by the connection's own dialect, so a driver is only ever
 * handed a config of the dialect it declares.
 *
 * `TConfig` is the connection shape this driver reads. A dialect package names
 * its own, and its hooks then receive that shape instead of one it has to
 * assert its way out of — which is what every contributed dialect had to do,
 * `dameng` through `source as unknown as DamengConnectionConfig`. The default
 * is any connection, which is what the core call sites hold.
 */
export interface DatabaseDriverDefinition<
  TDialect extends string = string,
  TConfig extends AnyConnectionConfig = AnyConnectionConfig,
> {
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
  createKnexClient?(
    config: TConfig,
    baseClient?: typeof Knex.Client,
  ): string | typeof Knex.Client;
  resolveConnection?(config: TConfig): {
    connection: unknown;
    searchPath?: string[];
    useNullAsDefault?: boolean;
  };
  createSchemaInspector?(context: {
    connectionName: string;
    config: TConfig;
    resolveClient: () => Promise<Knex>;
  }): SchemaInspector;
  /**
   * Applies application-level defaults and path normalization owned by the
   * dialect package. The core database manager only consumes the resulting
   * connection and never needs to know dialect-specific defaults.
   */
  normalizeConnection?(
    config: TConfig,
    context: {
      resolveStoragePath?: (filename: string) => string;
    },
  ): TConfig;
  /**
   * Returns a stable identity for managed-database ownership checks. Drivers
   * may return `undefined` for connections that do not have a local target
   * (for example an in-memory database).
   */
  resolveOwnershipTarget?(config: TConfig): readonly unknown[] | undefined;
  /**
   * Clears the objects owned by a managed connection while preserving the
   * database and its target schema. Used by the explicit destructive
   * migration reset command.
   */
  resetManagedSchema?(context: {
    connectionName: string;
    config: TConfig;
    resolveClient: () => Promise<Knex>;
  }): void | Promise<void>;
  /**
   * Prepares any local storage required before a connection is opened.
   * Application hosts provide the filesystem operation; drivers own the
   * decision about whether it is needed.
   */
  prepareStorage?(
    config: TConfig,
    context: {
      ensureDirectory: (directory: string) => Promise<void>;
    },
  ): void | Promise<void>;
  configurePool?(config: TConfig, pool: Knex.PoolConfig): Knex.PoolConfig;
}

/**
 * Factory exported by a dialect package.  A factory returns a connection
 * config with the package's driver already attached, while its `.driver`
 * property is the descriptor used by declarative registrations.
 */
export interface DatabaseDriverFactory<
  TDialect extends string = string,
  TOptions extends object = object,
  TConfig extends AnyConnectionConfig = AnyConnectionConfig,
> {
  (options?: TOptions): AnyConnectionConfig & {
    dialect: TDialect;
    databaseDriver: DatabaseDriverDefinition<TDialect, TConfig>;
  };
  readonly dialect: TDialect;
  readonly driver: DatabaseDriverDefinition<TDialect, TConfig>;
}

export type DatabaseDriverRegistration<
  TDialect extends string = string,
  TConfig extends AnyConnectionConfig = AnyConnectionConfig,
> =
  | DatabaseDriverDefinition<TDialect, TConfig>
  | DatabaseDriverFactory<TDialect, object, TConfig>;

/**
 * The connection shape one registration admits.
 *
 * A dialect package declares it on its driver, so this is how a configuration learns what a
 * registered driver will accept without the set of dialects being written down anywhere central.
 *
 * A factory is matched by its `driver` property rather than by `DatabaseDriverFactory`: a factory
 * narrows its own options — `(options?: SqliteOptions)` — which under contravariance does not
 * satisfy that interface's `(options?: TOptions)` call signature, so matching against it silently
 * fell through to the descriptor branch and resolved every dialect to the default.
 */
export type ConnectionOfRegistration<TRegistration> = TRegistration extends {
  readonly driver: DatabaseDriverDefinition<string, infer TConfig>;
}
  ? TConfig
  : TRegistration extends DatabaseDriverDefinition<string, infer TConfig>
    ? TConfig
    : never;

/** The union of connection shapes a `drivers` map admits. */
export type ConnectionsOfDrivers<
  TDrivers extends Record<string, DatabaseDriverRegistration>,
> = ConnectionOfRegistration<TDrivers[keyof TDrivers]>;

/**
 * Dialect identifiers are open ended. The connection config aliases below give
 * strict fields for the dialects this package declares, while a driver package
 * contributes its own dialect literal and its own connection shape — see
 * `DatabaseDriverDefinition`'s `TConfig` — without changing this package.
 */
export type DatabaseDialect = string;

export type SchemaManagementMode = 'managed' | 'external';

export interface BaseConnectionConfig {
  naming?: NamingOptions;
  capabilities?: Partial<DatabaseCapabilities>;
  metadataStore?: CollectionMetadataStore | CollectionMetadataStoreConfig;
  onCollectionMetadataInvalidationError?: (error: unknown) => void;
  schemaManagement?: SchemaManagementMode;
  /**
   * Physical tables on this connection that are NocoBase bookkeeping rather
   * than Collections — a migration or seed history or lock table given a
   * custom name. Tables under the `__nocobase_` prefix are recognised without
   * being listed; anything else the application names has to be declared here
   * or `collections.list()` and `scan()` report it as a Collection.
   */
  internalTables?: readonly string[];
  debug?: boolean;
  pool?: Knex.PoolConfig;
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
  T extends ExtensibleDatabaseConfig<AnyConnectionConfig>,
>(config: T): T {
  return config;
}
