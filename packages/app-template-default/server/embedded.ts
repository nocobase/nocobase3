import type { Hono } from 'hono';

import { createAppRuntime } from '@nocobase/app-server/runtime';

import {
  createAppFromRuntime,
  loadEmbeddedAppConfig,
  onceAsync,
  prepareAppRuntime,
  type AppScope,
} from './runtime/index.js';

export type { AppDisposer, AppScope } from './runtime/index.js';

export type EmbeddedServer = Hono;

export async function createServer(scope: AppScope): Promise<EmbeddedServer> {
  const runtime = createAppRuntime(loadEmbeddedAppConfig(scope, import.meta.url));

  scope.registerDisposer('runtime', onceAsync(() => runtime.dispose()));
  await prepareAppRuntime(runtime);

  return createAppFromRuntime(runtime, {
    viteDevUrl: false,
    lifecycle: scope,
  });
}

export default createServer;
