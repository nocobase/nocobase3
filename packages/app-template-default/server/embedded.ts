import type { Application } from '@nocobase/app-server-kit/application';
import {
  resolveAppRuntime,
  startApplicationInScope,
  type AppDisposer,
  type AppScope,
} from '@nocobase/app-server-kit/runtime';

import { createApp } from './app.js';
import type { AppConfig } from './config/index.js';
import type { DefaultAppScopeConfig } from './config/types.js';
import appRuntime from './runtime.js';

export type { AppDisposer, AppScope };

export type EmbeddedServer = Application<AppConfig>;

export async function createServer(
  scope: AppScope<DefaultAppScopeConfig>,
): Promise<EmbeddedServer> {
  const runtime = resolveAppRuntime(appRuntime, scope);
  const app = createApp(runtime);

  return startApplicationInScope(scope, app);
}

export default createServer;
