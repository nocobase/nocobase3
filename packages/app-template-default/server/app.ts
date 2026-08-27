import { Hono } from 'hono';

import type { AppWebSocketHandler } from '@nocobase/app-server-kit/websocket';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import { createRealtimeServer } from '@nocobase/app-server-kit/realtime';
import type { CreateAppOptions } from './app-options.js';
import { onceAsync } from './runtime/disposers.js';
import {
  registerNocoBaseApiProxyRoutes,
  resolveNocoBaseApiUrl,
} from '@nocobase/app-server-kit/proxy';
import { registerSpaRoutes } from '@nocobase/app-server-kit/spa';
import {
  normalizeBasePath,
  resolveAppName,
} from '@nocobase/app-server-kit/support';
import type { AppConfig } from './config/index.js';
import { createAppDeps, disposeAppDeps } from './runtime/deps.js';
import { createAppServices } from './services/index.js';
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

export type AppServer = Hono & {
  websocket?: AppWebSocketHandler;
};

export function createApp(
  runtime: AppRuntime<AppConfig>,
  options: CreateAppOptions,
): AppServer {
  const { config } = runtime;
  const publicBasePath = normalizeBasePath(config.app.publicBasePath);
  const internalBasePath = normalizeBasePath(config.app.internalBasePath);
  const appName = resolveAppName(config.app.name);
  const internalApiProxyPath = normalizeBasePath(
    config.app.internalApiProxyPath,
  );
  const publicApiUrl = config.app.publicApiUrl;
  const nocoBaseApiUrl = resolveNocoBaseApiUrl(config.app.nocoBaseApiUrl);
  const deps = createAppDeps(runtime);
  options.lifecycle.registerDisposer(
    'app-deps',
    onceAsync(() => disposeAppDeps(deps)),
  );
  const realtime = createRealtimeServer({
    resolvePrincipal: async (request) => {
      const session = await deps.auth.getSession(request.headers);
      return session ? { userId: session.user.id } : undefined;
    },
  });
  options.lifecycle.registerDisposer(
    'realtime-service',
    onceAsync(() => realtime.close()),
  );
  const services = createAppServices(runtime, deps, {
    realtime: realtime.service,
  });
  const app = new Hono();
  for (const plugin of options.pluginBootstraps ?? []) {
    plugin.bootstrap({
      config,
      deps,
      services,
      lifecycle: {
        registerDisposer(name, dispose): void {
          options.lifecycle.registerDisposer(
            `plugin:${plugin.packageName}:${name}`,
            onceAsync(dispose),
          );
        },
      },
    });
  }
  services.notification?.activate();

  registerAppRoutes(app, {
    appName,
    publicBasePath,
    deps,
    services,
  });

  for (const plugin of options.pluginRoutes ?? []) {
    plugin.registerRoutes({
      app,
      config,
      deps,
      services,
      paths: runtime.paths,
    });
  }

  registerNocoBaseApiProxyRoutes(app, {
    apiProxyPath: internalApiProxyPath,
    nocoBaseApiUrl,
  });

  realtime.registerHttpRoute(app);

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
    websocket: realtime.websocket,
  });
}
