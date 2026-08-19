import type { DatabaseManager } from '@nocobase/database';

import { createAppDatabaseManager } from '../database/manager.js';
import { createAppMigrator, type AppMigrationRunResult, type AppMigrator } from '../database/migrator.js';
import { prepareAppDatabaseStorage } from '../database/storage.js';
import type { AppDatabaseConfig } from '../database/types.js';

export interface AppRuntimeConfig {
  database: AppDatabaseConfig;
}

export interface AppRuntime<TConfig extends AppRuntimeConfig = AppRuntimeConfig> {
  config: TConfig;
  database?: DatabaseManager;
  migrator?: AppMigrator;
  runMigrations(): Promise<AppMigrationRunResult | undefined>;
  dispose(): Promise<void>;
}

export function createAppRuntime<TConfig extends AppRuntimeConfig>(config: TConfig): AppRuntime<TConfig> {
  const database = createAppDatabaseManager(config.database);
  const migrator = database
    ? createAppMigrator({
        database,
        config: config.database.migrations,
      })
    : undefined;

  return {
    config,
    database,
    migrator,
    runMigrations: () => migrator?.latest() ?? Promise.resolve(undefined),
    dispose: () => database?.destroy() ?? Promise.resolve(),
  };
}

export async function runConfiguredAppMigrations(runtime: AppRuntime): Promise<AppMigrationRunResult | undefined> {
  if (!runtime.config.database.migrations.autoRun) {
    return undefined;
  }

  await prepareAppDatabaseStorage(runtime.config.database);
  return runtime.runMigrations();
}
