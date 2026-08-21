import type { DatabaseManager } from '@nocobase/database';

import { createAppDatabaseManager } from '../database/manager.js';
import {
  createAppMigrator,
  type AppMigrationRunResult,
  type AppMigrator,
} from '../database/migrator.js';
import {
  createAppSeeder,
  type AppSeeder,
  type AppSeedRunResult,
} from '../database/seeder.js';
import { prepareAppDatabaseStorage } from '../database/storage.js';
import type { AppDatabaseConfig } from '../database/types.js';

export interface AppRuntimeConfig {
  database: AppDatabaseConfig;
}

export interface AppRuntime<
  TConfig extends AppRuntimeConfig = AppRuntimeConfig,
> {
  config: TConfig;
  database?: DatabaseManager;
  migrator?: AppMigrator;
  seeder?: AppSeeder;
  runMigrations(): Promise<AppMigrationRunResult | undefined>;
  runSeeds(): Promise<AppSeedRunResult | undefined>;
  dispose(): Promise<void>;
}

export function createAppRuntime<TConfig extends AppRuntimeConfig>(
  config: TConfig,
): AppRuntime<TConfig> {
  const database = createAppDatabaseManager(config.database);
  const migrator = database
    ? createAppMigrator({
        database,
        config: config.database.migrations,
      })
    : undefined;
  const seeder =
    database && config.database.seeds
      ? createAppSeeder({
          database,
          config: config.database.seeds,
        })
      : undefined;

  return {
    config,
    database,
    migrator,
    seeder,
    runMigrations: () => migrator?.latest() ?? Promise.resolve(undefined),
    runSeeds: () => seeder?.run() ?? Promise.resolve(undefined),
    dispose: () => database?.destroy() ?? Promise.resolve(),
  };
}

export async function runConfiguredAppSeeds(
  runtime: AppRuntime,
): Promise<AppSeedRunResult | undefined> {
  if (!runtime.config.database.seeds?.autoRun) {
    return undefined;
  }

  await prepareAppDatabaseStorage(runtime.config.database);
  return runtime.runSeeds();
}

export async function runConfiguredAppMigrations(
  runtime: AppRuntime,
): Promise<AppMigrationRunResult | undefined> {
  if (!runtime.config.database.migrations.autoRun) {
    return undefined;
  }

  await prepareAppDatabaseStorage(runtime.config.database);
  return runtime.runMigrations();
}
