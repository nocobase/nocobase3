import type { Application } from '@nocobase/app-server-kit/application';

import type { AppConfig } from './config/index.js';
import {
  createConfiguredApplication,
  createAppConfigPaths,
  loadAppConfig,
  onceAsync,
  resolveAppOptions,
  type AppScope,
} from './runtime/index.js';

export type { AppDisposer, AppScope } from './runtime/index.js';

export type EmbeddedServer = Application<AppConfig>;

export async function createServer(scope: AppScope): Promise<EmbeddedServer> {
  const options = resolveAppOptions(scope);
  const config = loadAppConfig(options);
  const paths = createAppConfigPaths(options.paths);

  const app = await createConfiguredApplication(config, paths, {
    viteDevUrl: options.mode === 'standalone' ? undefined : false,
  });

  scope.registerDisposer(
    'application',
    onceAsync(() => app.shutdown()),
  );
  await app.start();

  return app;
}

export default createServer;
