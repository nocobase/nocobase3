import { prepareAppDatabaseStorage } from '@nocobase/app-server-kit/database';
import {
  runConfiguredAppMigrations,
  runConfiguredAppSeeds,
  type AppRuntime,
} from '@nocobase/app-server-kit/runtime';

import type { AppConfig } from '../config/index.js';

export async function prepareAppRuntime(
  runtime: AppRuntime<AppConfig>,
): Promise<void> {
  await prepareAppDatabaseStorage(runtime.config.database);
  await runConfiguredAppMigrations(runtime);
  await runConfiguredAppSeeds(runtime);
}
