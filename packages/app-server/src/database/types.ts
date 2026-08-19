import type { DatabaseConfig as NocoBaseDatabaseConfig } from '@nocobase/database';

export interface AppDatabaseConfig extends NocoBaseDatabaseConfig {
  migrations: AppDatabaseMigrationConfig;
}

export interface AppDatabaseMigrationConfig {
  directory: string;
  autoRun: boolean;
  tableName?: string;
  lockTableName?: string;
  extensions?: readonly string[];
}
