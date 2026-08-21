import { Hono } from 'hono';

import type { AppWebSocketHandler } from '@nocobase/app-server/websocket';
import type { AppRuntime } from '@nocobase/app-server/runtime';
import type { CreateAppOptions } from './app-options.js';
import { onceAsync } from './runtime/disposers.js';
import { registerNocoBaseApiProxyRoutes, resolveNocoBaseApiUrl } from '@nocobase/app-server/proxy';
import { registerSpaRoutes } from '@nocobase/app-server/spa';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppName,
} from '@nocobase/app-server/support';
import type { AppConfig } from './config/index.js';
import { startClockPublisher } from './realtime/publishers/clock.js';
import { createRealtimeService } from './realtime/service.js';
import { createAppDeps, disposeAppDeps } from './runtime/deps.js';
import { createAppServices } from './services/index.js';
import { registerAppRoutes } from './routes/index.js';
import { createWebSocketHandler, registerWebSocketRoutes } from './routes/websocket.js';
import { createPortalSpaRuntimeGlobals } from './spa/runtime-globals.js';

export type { AppDisposer, AppLifecycle, CreateAppOptions, SpaHandler } from './app-options.js';
export { joinBasePath, normalizeBasePath } from '@nocobase/app-server/support';

export type AppServer = Hono & {
  websocket?: AppWebSocketHandler;
  start(): Promise<void>;
};

export function createApp(runtime: AppRuntime<AppConfig>, options: CreateAppOptions): AppServer {
  const { config } = runtime;
  const publicBasePath = normalizeBasePath(config.app.publicBasePath);
  const internalBasePath = normalizeBasePath(config.app.internalBasePath);
  const appName = resolveAppName(config.app.name);
  const internalApiProxyPath = normalizeBasePath(config.app.internalApiProxyPath);
  const publicApiUrl = config.app.publicApiUrl;
  const nocoBaseApiUrl = resolveNocoBaseApiUrl(config.app.nocoBaseApiUrl);
  const deps = createAppDeps(runtime);
  options.lifecycle.registerDisposer('app-deps', onceAsync(() => disposeAppDeps(deps)));
  const services = createAppServices(runtime, deps);
  options.lifecycle.registerDisposer('app-services', onceAsync(() => services.dispose()));
  const realtime = createRealtimeService();
  options.lifecycle.registerDisposer('realtime-service', onceAsync(() => realtime.close()));
  const stopClockPublisher = startClockPublisher(realtime);
  options.lifecycle.registerDisposer('clock-publisher', onceAsync(stopClockPublisher));
  const app = new Hono();

  registerAppRoutes(app, {
    appName,
    publicBasePath,
    deps,
    services,
  });

  registerNocoBaseApiProxyRoutes(app, {
    apiProxyPath: internalApiProxyPath,
    nocoBaseApiUrl,
  });

  registerWebSocketRoutes(app);

  if (services.notification) {
    app.route(joinBasePath(internalBasePath, '/api/notifications'), services.notification.router);
  }

  registerSpaRoutes(app, {
    basePath: internalBasePath,
    handler: options.spa?.handler,
    indexPath: config.spa.indexPath,
    runtimeGlobals: createPortalSpaRuntimeGlobals({
      appBasePath: publicBasePath,
      apiUrl: publicApiUrl,
      storagePrefix: config.spa.runtime.storagePrefix,
      storageType: config.spa.runtime.storageType,
      shareToken: config.spa.runtime.shareToken,
    }),
  });

  return Object.assign(app, {
    websocket: createWebSocketHandler({ realtime }),
    start: onceAsync(() => services.start()),
  });
}
