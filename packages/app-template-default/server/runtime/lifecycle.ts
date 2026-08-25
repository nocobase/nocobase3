import { prepareAppDatabaseStorage } from '@nocobase/app-server/database';
import type { AppRuntime } from '@nocobase/app-server/runtime';

import type { AppConfig } from '../config/index.js';

export async function prepareAppRuntime(
  runtime: AppRuntime<Pick<AppConfig, 'database' | 'plugins'>>,
): Promise<void> {
  await prepareAppDatabaseStorage(runtime.config.database);
  if (runtime.config.database.migrations.autoRun) {
    await runtime.runMigrations();
  } else {
    await runtime.restoreMetadata();
  }
  if (runtime.config.database.seeds?.autoRun) {
    await runtime.runSeeds();
  }
}
