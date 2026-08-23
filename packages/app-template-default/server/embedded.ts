import { createAppRuntime } from '@nocobase/app-server/runtime';

import type { AppServer } from './app.js';
import {
  createAppFromRuntime,
  loadEmbeddedAppConfig,
  onceAsync,
  prepareAppRuntime,
  startAppWorkflow,
  type AppScope,
} from './runtime/index.js';

export type { AppDisposer, AppScope } from './runtime/index.js';

export type EmbeddedServer = AppServer;

export async function createServer(
  scope: AppScope,
  moduleUrl: string = import.meta.url,
): Promise<EmbeddedServer> {
  const runtime = createAppRuntime(loadEmbeddedAppConfig(scope, moduleUrl));

  scope.registerDisposer(
    'runtime',
    onceAsync(() => runtime.dispose()),
  );
  await prepareAppRuntime(runtime);

  const app = await createAppFromRuntime(runtime, {
    viteDevUrl: false,
    lifecycle: scope,
  });
  await startAppWorkflow(runtime);
  return app;
}

export default createServer;
