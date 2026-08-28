import { createAppRuntime } from '@nocobase/app-server-kit/runtime';

import type { AppServer } from './app.js';
import {
  createAppFromRuntime,
  createRuntimeConfigPaths,
  loadAppConfig,
  onceAsync,
  prepareAppRuntime,
  resolveEmbeddedRuntimeOptions,
  type AppScope,
} from './runtime/index.js';

export type { AppDisposer, AppScope } from './runtime/index.js';

export type EmbeddedServer = AppServer;

export async function createServer(
  scope: AppScope,
  moduleUrl: string = import.meta.url,
): Promise<EmbeddedServer> {
  const options = resolveEmbeddedRuntimeOptions(scope, moduleUrl);
  const runtime = createAppRuntime(loadAppConfig(options), {
    paths: createRuntimeConfigPaths(options.paths),
  });

  scope.registerDisposer(
    'runtime',
    onceAsync(() => runtime.dispose()),
  );
  await prepareAppRuntime(runtime);

  const app = await createAppFromRuntime(runtime, {
    viteDevUrl: false,
    lifecycle: scope,
  });
  return app;
}

export default createServer;
