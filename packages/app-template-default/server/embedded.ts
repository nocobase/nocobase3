import { createAppRuntime } from '@nocobase/app-server-kit/runtime';
import type { Application } from '@nocobase/app-server-kit/application';

import type { AppConfig } from './config/index.js';
import {
  createAppFromRuntime,
  createRuntimeConfigPaths,
  loadAppConfig,
  resolveAppRuntimeOptions,
  type AppScope,
} from './runtime/index.js';

export type { AppDisposer, AppScope } from './runtime/index.js';

export type EmbeddedServer = Application<AppConfig>;

export async function createServer(scope: AppScope): Promise<EmbeddedServer> {
  const options = resolveAppRuntimeOptions(scope);
  const runtime = createAppRuntime(loadAppConfig(options), {
    paths: createRuntimeConfigPaths(options.paths),
  });

  return await createAppFromRuntime(runtime, {
    viteDevUrl: scope.mode === 'standalone' ? undefined : false,
    lifecycle: scope,
  });
}

export default createServer;
