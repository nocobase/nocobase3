import { createAppRuntime } from '@nocobase/app-server-kit/runtime';
import type { Application } from '@nocobase/app-server-kit/application';

import type { AppConfig } from './config/index.js';
import {
  createAppFromRuntime,
  createRuntimeConfigPaths,
  loadAppConfig,
  resolveEmbeddedRuntimeOptions,
  type AppScope,
} from './runtime/index.js';

export type { AppDisposer, AppScope } from './runtime/index.js';

export type EmbeddedServer = Application<AppConfig>;

export async function createServer(
  scope: AppScope,
  moduleUrl: string = import.meta.url,
): Promise<EmbeddedServer> {
  const options = resolveEmbeddedRuntimeOptions(scope, moduleUrl);
  const runtime = createAppRuntime(loadAppConfig(options), {
    paths: createRuntimeConfigPaths(options.paths),
  });

  return await createAppFromRuntime(runtime, {
    viteDevUrl: false,
    lifecycle: scope,
  });
}

export default createServer;
