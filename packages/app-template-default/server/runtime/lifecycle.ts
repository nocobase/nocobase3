import { prepareAppDatabaseStorage } from '@nocobase/app-server/database';
import { runConfiguredAppMigrations, type AppRuntime } from '@nocobase/app-server/runtime';

import type { AppConfig } from '../config/index.js';

export async function prepareAppRuntime(runtime: AppRuntime<AppConfig>): Promise<void> {
  await prepareAppDatabaseStorage(runtime.config.database);
  await runConfiguredAppMigrations(runtime);
}
