import type {
  BaseConnectionConfig,
  CollectionMetadataStore,
  CollectionMetadataStoreConfig,
  ConnectionConfig,
  ExtensibleDatabaseConfig,
  MigrationSource,
  SeedSource,
} from '@nocobase/db';

/**
 * A metadata store as an application may configure it: the instance, the
 * declarative form `@nocobase/db` understands, or — the form `config.yml` can
 * carry — the collections directory alone. Relative directories resolve
 * against the application root.
 */
export type AppMetadataStoreConfig =
  string | CollectionMetadataStoreConfig | CollectionMetadataStore;

/**
 * A connection shape an application may configure, which is every dialect
 * `@nocobase/db` declares a config type for by default.
 *
 * Naming another one admits a dialect from a package that contributes its own,
 * the way `createDatabaseManager` already accepts one through
 * `ExtensibleDatabaseConfig`. Only the named shapes are accepted, so widening
 * for one dialect leaves every other one as strict as it was:
 *
 * ```ts
 * const database: AppConfigFactory<
 *   AppDatabaseConfig<ConnectionConfig | KingbaseConnectionConfig>
 * > = defineAppConfig(() => ({
 *   drivers: { kingbase },
 *   connections: { main: { dialect: 'kingbase', database: 'crm' } },
 * }));
 * ```
 */
export type AppConnectionShape = BaseConnectionConfig & { dialect: string };

export interface AppDatabaseConfig<
  TConnection extends AppConnectionShape = ConnectionConfig,
> extends Omit<
  ExtensibleDatabaseConfig<TConnection>,
  'connections' | 'metadataStore'
> {
  connections: Record<string, AppDatabaseConnectionConfig<TConnection>>;
  metadataStore?: AppMetadataStoreConfig;
  /** @deprecated Configure tasks on connections instead. Applies to the default connection. */
  migrations?: Partial<AppDatabaseMigrationConfig>;
  /** @deprecated Configure tasks on connections instead. Applies to the default connection. */
  seeds?: Partial<AppDatabaseSeedConfig>;
}

/**
 * Runtime facts that task planning needs and configuration cannot supply: the
 * application's own package identity, and the migration and seed directories
 * contributed by its server plugins.
 *
 * These are derived from resolved plugins rather than configured, so they are
 * passed alongside the configuration instead of being merged into it — a value
 * inside the `database` namespace can be overwritten from `config.yml`, and
 * silently dropping a plugin's migrations is not a configurable outcome.
 */
export interface AppDatabaseTaskContributions {
  readonly appPackageName: string;
  readonly migrations: readonly MigrationSource[];
  readonly seeds: readonly SeedSource[];
}

export interface AppDatabaseMigrationConfig {
  directory: string;
  packageName?: string;
  autoRun: boolean;
  sources?: readonly MigrationSource[];
  tableName?: string;
  lockTableName?: string;
  extensions?: readonly string[];
}

export interface AppDatabaseSeedConfig {
  directory: string;
  packageName?: string;
  autoRun: boolean;
  sources?: readonly SeedSource[];
  tableName?: string;
  lockTableName?: string;
  extensions?: readonly string[];
}

/** `Omit` over a union keeps only the common keys; distribute it so each dialect keeps its own. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type AppDatabaseConnectionConfig<
  TConnection extends AppConnectionShape = ConnectionConfig,
> = DistributiveOmit<TConnection, 'metadataStore'> & {
  migrations?: Partial<AppDatabaseMigrationConfig>;
  seeds?: Partial<AppDatabaseSeedConfig>;
  /**
   * Where supplemental metadata comes from. An `external` connection that
   * sets nothing here or at the top level reads
   * `database/<connection>/collections/*\/metadata.json`.
   */
  metadataStore?: AppMetadataStoreConfig;
};
