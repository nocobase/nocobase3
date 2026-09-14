import type {
  DatabaseConfig as NocoBaseDatabaseConfig,
  MigrationSource,
  SeedSource,
} from '@nocobase/db';

export interface AppDatabaseConfig extends NocoBaseDatabaseConfig {
  connections: Record<string, AppDatabaseConnectionConfig>;
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

export type AppDatabaseConnectionConfig =
  NocoBaseDatabaseConfig['connections'][string] & {
    migrations?: Partial<AppDatabaseMigrationConfig>;
    seeds?: Partial<AppDatabaseSeedConfig>;
  };
