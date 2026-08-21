import type { DatabaseConfig as NocoBaseDatabaseConfig } from '@nocobase/database';

export interface AppDatabaseConfig extends NocoBaseDatabaseConfig {
  migrations: AppDatabaseMigrationConfig;
  seeds?: AppDatabaseSeedConfig;
}

export interface AppDatabaseMigrationConfig {
  directory: string;
  autoRun: boolean;
  tableName?: string;
  lockTableName?: string;
  extensions?: readonly string[];
}

export interface AppDatabaseSeedConfig {
  directory: string;
  packageName?: string;
  autoRun: boolean;
  tableName?: string;
  lockTableName?: string;
  extensions?: readonly string[];
}
