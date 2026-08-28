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
  resolveAppRuntimeOptions,
} from './runtime/options.js';
import { createStandaloneScope } from './runtime/standalone-scope.js';

export type DatabaseTaskRuntime = AppRuntime<DatabaseTaskConfig>;

export function createStandaloneDatabaseTaskRuntime(): DatabaseTaskRuntime {
  const options = resolveAppRuntimeOptions(createStandaloneScope());
  return createAppRuntime(loadDatabaseTaskConfig(options), {
    paths: createRuntimeConfigPaths(options.paths),
  });
}
