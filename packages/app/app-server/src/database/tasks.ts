import type { DatabaseManager } from '@nocobase/db';

import type { ConfigPaths } from '../config/index.js';
import { createAppDatabaseManager } from './manager.js';
import { createAppMigrator, type AppMigrationRunResult } from './migrator.js';
import { createAppSeeder, type AppSeedRunResult } from './seeder.js';
import { prepareAppDatabaseStorage } from './storage.js';
import type { AppDatabaseConfig } from './types.js';

export async function runAppMigrations(
  config: AppDatabaseConfig,
  paths?: ConfigPaths,
): Promise<AppMigrationRunResult | undefined> {
  return runWithAppDatabase(config, paths, (database) =>
    createAppMigrator({
      database,
      config: config.migrations,
      sources: config.migrations.sources,
    }).latest(),
  );
}

export async function runAppSeeds(
  config: AppDatabaseConfig,
  paths?: ConfigPaths,
): Promise<AppSeedRunResult | undefined> {
  const seeds = config.seeds;
  if (!seeds) {
    return undefined;
  }

  return runWithAppDatabase(config, paths, (database) =>
    createAppSeeder({
      database,
      config: seeds,
      sources: seeds.sources,
    }).run(),
  );
}

async function runWithAppDatabase<TResult>(
  config: AppDatabaseConfig,
  paths: ConfigPaths | undefined,
  run: (database: DatabaseManager) => Promise<TResult>,
): Promise<TResult | undefined> {
  await prepareAppDatabaseStorage(config, paths);
  const database = createAppDatabaseManager(config, paths);
  if (!database) {
    return undefined;
  }

  try {
    return await run(database);
  } finally {
    await database.destroy();
  }
}
