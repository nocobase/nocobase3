import {
  createAppRuntime,
  type AppRuntime,
} from '@nocobase/app-server/runtime';

import {
  loadStandaloneDatabaseTaskConfig,
  type DatabaseTaskConfig,
} from './runtime/config.js';

export type DatabaseTaskRuntime = AppRuntime<DatabaseTaskConfig>;

export function createStandaloneDatabaseTaskRuntime(): DatabaseTaskRuntime {
  return createAppRuntime(loadStandaloneDatabaseTaskConfig(import.meta.url));
}
