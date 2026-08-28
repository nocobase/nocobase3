import {
  Application,
  type ApplicationFetchHandler,
} from '@nocobase/app-server-kit/application';
import type { AppWebSocketHandler } from '@nocobase/app-server-kit/websocket';
import type { ConfigPaths } from '@nocobase/app-server-kit/config';
import { DatabaseProvider } from '@nocobase/app-server-kit/database';
import { RealtimeProvider } from '@nocobase/app-server-kit/realtime';
import { RouterProvider } from '@nocobase/app-server-kit/router';
import { CachingProvider } from '@nocobase/caching';
import { DriveProvider } from '@nocobase/drive';
import { IdGeneratorProvider } from '@nocobase/id-generator';
import { LoggingProvider } from '@nocobase/logging';
import { QueueProvider } from '@nocobase/queue';
import { SessionProvider } from '@nocobase/session';
import type { CreateAppOptions } from './app-options.js';
import {
  registerNocoBaseApiProxyRoutes,
  resolveNocoBaseApiUrl,
} from '@nocobase/app-server-kit/proxy';
import { registerSpaRoutes } from '@nocobase/app-server-kit/spa';
import { normalizeBasePath } from '@nocobase/app-server-kit/support';
import type { AppConfig } from './config/index.js';
import { AppSettingsProvider, PublicFilesProvider } from './providers/index.js';
import { registerAppRoutes } from './routes/index.js';
import { createPortalSpaRuntimeGlobals } from './spa/runtime-globals.js';

export type {
  AppDisposer,
  AppLifecycle,
  CreateAppOptions,
  SpaHandler,
} from './app-options.js';
export {
  joinBasePath,
  normalizeBasePath,
} from '@nocobase/app-server-kit/support';

export interface AppServer {
  readonly fetch: ApplicationFetchHandler;
  websocket?: AppWebSocketHandler;
}

export function createApp(
  config: AppConfig,
  paths: ConfigPaths,
  options: CreateAppOptions,
): Application<AppConfig> {
  return createApplication(config, paths, options);
}

export function createApplication(
  config: AppConfig,
  paths: ConfigPaths,
  options: CreateAppOptions,
): Application<AppConfig> {
  const internalBasePath = normalizeBasePath(config.app.internalBasePath);
  const internalApiProxyPath = normalizeBasePath(
    config.app.internalApiProxyPath,
  );
  const publicApiUrl = config.app.publicApiUrl;
  const nocoBaseApiUrl = resolveNocoBaseApiUrl(config.app.nocoBaseApiUrl);
  const app = new Application({ config, paths });
  app.addProvider(RouterProvider);
  app.addProvider(DatabaseProvider);
  app.addProvider(AppSettingsProvider);
  app.addProvider(LoggingProvider);
  app.addProvider(CachingProvider);
  app.addProvider(IdGeneratorProvider);
  app.addProvider(SessionProvider);
  app.addProvider(DriveProvider);
  app.addProvider(PublicFilesProvider);
  app.addProvider(QueueProvider);
  app.addProvider(RealtimeProvider);
  for (const plugin of options.pluginProviders) {
    app.addProvider(plugin.Provider);
  }
  app.registerProviders();
  const router = app.router;

  registerAppRoutes(app);

  for (const plugin of options.pluginRoutes ?? []) {
    plugin.registerRoutes(app);
  }

  registerNocoBaseApiProxyRoutes(router, {
    apiProxyPath: internalApiProxyPath,
    nocoBaseApiUrl,
  });

  registerSpaRoutes(router, {
    basePath: internalBasePath,
    handler: options.spa?.handler,
    indexPath: config.spa.indexPath,
    runtimeGlobals: createPortalSpaRuntimeGlobals({
      appBasePath: app.publicBasePath,
      apiUrl: publicApiUrl,
      storagePrefix: config.spa.runtime.storagePrefix,
      storageType: config.spa.runtime.storageType,
      shareToken: config.spa.runtime.shareToken,
    }),
  });

  return app;
}
