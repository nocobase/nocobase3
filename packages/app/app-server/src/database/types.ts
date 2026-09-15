import type {
  CollectionMetadataStore,
  CollectionMetadataStoreConfig,
  DatabaseConfig as NocoBaseDatabaseConfig,
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

export interface AppDatabaseConfig extends Omit<
  NocoBaseDatabaseConfig,
  'connections' | 'metadataStore'
> {
  connections: Record<string, AppDatabaseConnectionConfig>;
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

export type AppDatabaseConnectionConfig = DistributiveOmit<
  NocoBaseDatabaseConfig['connections'][string],
  'metadataStore'
> & {
  migrations?: Partial<AppDatabaseMigrationConfig>;
  seeds?: Partial<AppDatabaseSeedConfig>;
  /**
   * Where supplemental metadata comes from. An `external` connection that
   * sets nothing here or at the top level reads
   * `database/<connection>/collections/*\/metadata.json`.
   */
  metadataStore?: AppMetadataStoreConfig;
};
