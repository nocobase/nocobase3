import type { Hono } from 'hono';

import { createAppRuntime, type AppRuntime } from '@nocobase/app-server/runtime';

import type { AppConfig } from './config/index.js';
import {
  createAppFromRuntime,
  loadEmbeddedAppConfig,
  prepareAppRuntime,
  type AppDisposer,
  type AppScope,
} from './runtime/index.js';

export type { AppDisposer, AppScope };

export async function createServer(scope: AppScope): Promise<Hono> {
  const runtime = createAppRuntime(loadEmbeddedAppConfig(scope, import.meta.url));

  await prepareAppRuntime(runtime);
  registerRuntimeDisposer(scope, runtime);

  return createAppFromRuntime(runtime, {
    viteDevUrl: false,
  });
}

export default createServer;

function registerRuntimeDisposer(scope: AppScope, runtime: AppRuntime<AppConfig>): void {
  if (!runtime.database) {
    return;
  }

  if (scope.registerDisposer) {
    scope.registerDisposer('database', () => runtime.dispose());
    return;
  }

  scope.onBeforeDestroy?.(() => runtime.dispose());
}
