import { createAppRuntime } from '@nocobase/app-server/runtime';

import type { AppServer } from './app.js';
import {
  createAppFromRuntime,
  loadEmbeddedAppConfig,
  onceAsync,
  prepareAppRuntime,
  type AppScope,
} from './runtime/index.js';

export type { AppDisposer, AppScope } from './runtime/index.js';

export type EmbeddedServer = AppServer;

export async function createServer(scope: AppScope): Promise<EmbeddedServer> {
  const runtime = createAppRuntime(loadEmbeddedAppConfig(scope, import.meta.url));

  scope.registerDisposer('runtime', onceAsync(() => runtime.dispose()));
  await prepareAppRuntime(runtime);

  const app = createAppFromRuntime(runtime, {
    viteDevUrl: false,
    lifecycle: scope,
  });
  await app.start();
  return app;
}

export default createServer;
