import type { DatabaseManager } from '@nocobase/app-database';

import { createAppDatabaseManager } from './manager.js';
import { createAppMigrator, type AppMigrationRunResult } from './migrator.js';
import { createAppSeeder, type AppSeedRunResult } from './seeder.js';
import { prepareAppDatabaseStorage } from './storage.js';
import type { AppDatabaseConfig } from './types.js';

export async function runAppMigrations(
  config: AppDatabaseConfig,
): Promise<AppMigrationRunResult | undefined> {
  return runWithAppDatabase(config, (database) =>
    createAppMigrator({
      database,
      config: config.migrations,
      sources: config.migrations.sources,
    }).latest(),
  );
}

export async function runAppSeeds(
  config: AppDatabaseConfig,
): Promise<AppSeedRunResult | undefined> {
  const seeds = config.seeds;
  if (!seeds) {
    return undefined;
  }

  return runWithAppDatabase(config, (database) =>
    createAppSeeder({
      database,
      config: seeds,
      sources: seeds.sources,
    }).run(),
  );
}

async function runWithAppDatabase<TResult>(
  config: AppDatabaseConfig,
  run: (database: DatabaseManager) => Promise<TResult>,
): Promise<TResult | undefined> {
  await prepareAppDatabaseStorage(config);
  const database = createAppDatabaseManager(config);
  if (!database) {
    return undefined;
  }

  try {
    return await run(database);
  } finally {
    await database.destroy();
  }
}
