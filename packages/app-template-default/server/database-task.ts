import {
  createAppRuntime,
  type AppRuntime,
} from '@nocobase/app-server-kit/runtime';

import {
  loadDatabaseTaskConfig,
  type DatabaseTaskConfig,
} from './runtime/config.js';
import {
  createRuntimeConfigPaths,
  resolveStandaloneRuntimeOptions,
} from './runtime/options.js';

export type DatabaseTaskRuntime = AppRuntime<DatabaseTaskConfig>;

export function createStandaloneDatabaseTaskRuntime(): DatabaseTaskRuntime {
  const options = resolveStandaloneRuntimeOptions(import.meta.url);
  return createAppRuntime(loadDatabaseTaskConfig(options), {
    paths: createRuntimeConfigPaths(options.paths),
  });
}
