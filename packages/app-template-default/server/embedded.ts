import type { Hono } from 'hono';

import { createAppRuntime } from '@nocobase/app-server/runtime';

import {
  createAppFromRuntime,
  loadEmbeddedAppConfig,
  prepareAppRuntime,
  type AppDisposer,
  type AppScope,
} from './runtime/index.js';

export type { AppDisposer, AppScope };

export interface EmbeddedServer extends Hono {
  close(): Promise<void>;
}

export async function createServer(scope: AppScope): Promise<EmbeddedServer> {
  const runtime = createAppRuntime(loadEmbeddedAppConfig(scope, import.meta.url));

  await prepareAppRuntime(runtime);
  const app = createAppFromRuntime(runtime, {
    viteDevUrl: false,
  });
  const closeApp = app.close;
  const close = onceAsync(async () => {
    await Promise.all([
      closeApp(),
      runtime.dispose(),
    ]);
  });

  registerRuntimeDisposer(scope, close);

  return Object.assign(app, { close });
}

export default createServer;

function registerRuntimeDisposer(scope: AppScope, dispose: AppDisposer): void {
  if (scope.registerDisposer) {
    scope.registerDisposer('app', dispose);
    return;
  }

  scope.onBeforeDestroy?.(dispose);
}

function onceAsync(dispose: () => void | Promise<void>): () => Promise<void> {
  let promise: Promise<void> | undefined;

  return () => {
    promise ??= Promise.resolve().then(dispose);
    return promise;
  };
}
