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
  /** Runtime contribution context; populated by the application, not driver options. */
  taskSources?: {
    directory?: string;
    packageName: string;
    migrations: readonly MigrationSource[];
    seeds: readonly SeedSource[];
  };
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
