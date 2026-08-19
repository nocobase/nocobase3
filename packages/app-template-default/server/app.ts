import { Hono } from 'hono';

import type { AppRuntime } from '@nocobase/app-server/runtime';
import type { CreateAppOptions } from './app-options.js';
import { registerNocoBaseApiProxyRoutes, resolveNocoBaseApiUrl } from '@nocobase/app-server/proxy';
import { registerSpaRoutes } from '@nocobase/app-server/spa';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppName,
} from '@nocobase/app-server/support';
import { createSessionMiddleware } from '@nocobase/session';
import type { AppConfig } from './config/index.js';
import { createApiRoutes } from './routes/api/index.js';
import { createHelloPageHandler } from './routes/hello.js';
import { createAppDeps, disposeAppDeps } from './runtime/deps.js';
import { createAppServices } from './services/index.js';
import { createPortalSpaRuntimeGlobals } from './spa/runtime-globals.js';

export type { CreateAppOptions, SpaHandler } from './app-options.js';
export { joinBasePath, normalizeBasePath } from '@nocobase/app-server/support';

export interface ClosableApp extends Hono {
  close(): Promise<void>;
}

export function createApp(runtime: AppRuntime<AppConfig>, options: CreateAppOptions = {}): ClosableApp {
  const { config } = runtime;
  const publicBasePath = normalizeBasePath(config.app.publicBasePath);
  const internalBasePath = normalizeBasePath(config.app.internalBasePath);
  const appName = resolveAppName(config.app.name);
  const internalApiProxyPath = normalizeBasePath(config.app.internalApiProxyPath);
  const publicApiUrl = config.app.publicApiUrl;
  const nocoBaseApiUrl = resolveNocoBaseApiUrl(config.app.nocoBaseApiUrl);
  const deps = createAppDeps(runtime);
  const services = createAppServices(runtime, deps);
  const app = new Hono();

  app.use('*', createSessionMiddleware(deps.sessionManager));

  app.get('/healthz', (c) => {
    return c.json({
      ok: true,
      app: {
        name: appName,
        basePath: publicBasePath,
      },
    });
  });
  app.get('/hello', createHelloPageHandler());

  registerNocoBaseApiProxyRoutes(app, {
    apiProxyPath: internalApiProxyPath,
    nocoBaseApiUrl,
  });

  app.route(
    joinBasePath(internalBasePath, '/api'),
    createApiRoutes({
      appName,
      publicBasePath,
      deps,
      services,
    }),
  );

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
    close: onceAsync(() => disposeAppDeps(deps)),
  });
}

function onceAsync(dispose: () => void | Promise<void>): () => Promise<void> {
  let promise: Promise<void> | undefined;

  return () => {
    promise ??= Promise.resolve().then(dispose);
    return promise;
  };
}
