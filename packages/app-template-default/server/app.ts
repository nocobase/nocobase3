import { Hono } from 'hono';
import path from 'node:path';

import type { CreateAppOptions } from './app-options.js';
import { registerNocoBaseApiProxyRoutes, resolveNocoBaseApiUrl } from '@nocobase/app-server/proxy';
import { registerSpaRoutes } from '@nocobase/app-server/spa';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppName,
  resolveAppNameFromBasePath,
} from '@nocobase/app-server/support';
import { createSessionMiddleware } from '@nocobase/session';
import { createApiRoutes } from './routes/api/index.js';
import { createAppServices } from './services/index.js';
import { createPortalSpaRuntimeGlobals } from './spa/runtime-globals.js';

export type { CreateAppNotificationsOptions, CreateAppOptions, SpaHandler } from './app-options.js';
export { joinBasePath, normalizeBasePath } from '@nocobase/app-server/support';

export interface ClosableApp extends Hono {
  start(): Promise<void>;
  close(): Promise<void>;
}

export function createApp(options: CreateAppOptions = {}): ClosableApp {
  const publicBasePath = normalizeBasePath(options.publicBasePath ?? '/app-template-default');
  const internalBasePath = normalizeBasePath(options.internalBasePath ?? '');
  const appName = resolveAppName(options.appName ?? resolveAppNameFromBasePath(publicBasePath, 'app-template-default'));
  const internalApiProxyPath = normalizeBasePath(options.internalApiProxyPath ?? '/v2/api');
  const publicApiUrl = options.publicApiUrl ?? joinBasePath(publicBasePath, internalApiProxyPath);
  const nocoBaseApiUrl = resolveNocoBaseApiUrl(options.nocoBaseApiUrl);
  const spaIndexPath = options.spa?.indexPath ?? path.resolve(process.cwd(), 'index.html');
  const spaRuntime = options.spa?.runtime ?? {};
  const services = createAppServices({
    cache: options.cache,
    database: options.database,
    drive: options.drive,
    logger: options.logger,
    queue: options.queue,
    session: options.session,
    notifications: options.notifications,
  });
  const app = new Hono();

  app.use('*', createSessionMiddleware(services.sessionManager));

  app.get('/healthz', (c) => {
    return c.json({
      ok: true,
      app: {
        name: appName,
        basePath: publicBasePath,
      },
    });
  });

  registerNocoBaseApiProxyRoutes(app, {
    apiProxyPath: internalApiProxyPath,
    nocoBaseApiUrl,
  });

  app.route(
    joinBasePath(internalBasePath, '/api'),
    createApiRoutes({
      appName,
      publicBasePath,
      services,
    }),
  );

  if (services.notificationModule) {
    app.route(joinBasePath(internalBasePath, '/api/notifications'), services.notificationModule.router);
  }

  registerSpaRoutes(app, {
    basePath: internalBasePath,
    handler: options.spa?.handler,
    indexPath: spaIndexPath,
    runtimeGlobals: createPortalSpaRuntimeGlobals({
      appBasePath: publicBasePath,
      apiUrl: publicApiUrl,
      storagePrefix: spaRuntime.storagePrefix,
      storageType: spaRuntime.storageType,
      shareToken: spaRuntime.shareToken,
    }),
  });

  return Object.assign(app, {
    start: onceAsync(() => services.start()),
    close: onceAsync(() => services.dispose()),
  });
}

function onceAsync(dispose: () => void | Promise<void>): () => Promise<void> {
  let promise: Promise<void> | undefined;

  return () => {
    promise ??= Promise.resolve().then(dispose);
    return promise;
  };
}
