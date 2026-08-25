import { createAppRuntime } from '@nocobase/app-server-kit/runtime';

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
  const runtime = createAppRuntime(
    loadEmbeddedAppConfig(scope, import.meta.url),
  );

  scope.registerDisposer(
    'runtime',
    onceAsync(() => runtime.dispose()),
  );
  await prepareAppRuntime(runtime);

  return await createAppFromRuntime(runtime, {
    viteDevUrl: false,
    lifecycle: scope,
  });
}

export default createServer;
