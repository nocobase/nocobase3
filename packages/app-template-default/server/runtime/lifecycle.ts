import { prepareAppDatabaseStorage } from '@nocobase/app-runtime/database';
import {
  runConfiguredAppMigrations,
  runConfiguredAppSeeds,
  type AppRuntime,
} from '@nocobase/app-runtime/runtime';
import { prepareDriveStorage } from '@nocobase/drive';

import type { AppConfig } from '../config/index.js';

export async function prepareAppRuntime(
  runtime: AppRuntime<AppConfig>,
): Promise<void> {
  await prepareAppDatabaseStorage(runtime.config.database);
  await prepareDriveStorage(runtime.config.drive);
  await runConfiguredAppMigrations(runtime);
  await runConfiguredAppSeeds(runtime);
}
