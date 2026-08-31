import type {
  DatabaseConfig as NocoBaseDatabaseConfig,
  MigrationSource,
  SeedSource,
} from '@nocobase/app-database';

export interface AppDatabaseConfig extends NocoBaseDatabaseConfig {
  migrations: AppDatabaseMigrationConfig;
  seeds?: AppDatabaseSeedConfig;
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
