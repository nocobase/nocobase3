import { Hono } from 'hono';
import path from 'node:path';

import {
  createPortalSpaRuntimeGlobals,
  registerSpaRoutes,
} from '@nocobase/app-server-kit/spa';
import {
  joinBasePath,
  normalizeBasePath,
  resolveApiProxyPath,
  resolveAppName,
} from '@nocobase/app-server-kit/support';

import { createOrdersApiRoutes } from './routes.js';
import type { OrdersRuntime } from './runtime.js';

export interface CreateAppOptions {
  appName?: string;
  basePath?: string;
  browserBasePath?: string;
  browserApiUrl?: string;
  apiProxyPath?: string;
  clientHandler?: (request: Request) => Response | Promise<Response>;
  clientIndexPath?: string;
  releaseId?: string | null;
  ordersRuntime?: OrdersRuntime;
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const appName = resolveAppName(options.appName);
  const internalBasePath = normalizeBasePath(options.basePath ?? `/${appName}`);
  const publicBasePath = normalizeBasePath(
    options.browserBasePath ?? internalBasePath,
  );
  const apiPath = resolveApiProxyPath(
    options.apiProxyPath ?? joinBasePath(internalBasePath, '/api'),
    internalBasePath,
  );
  const app = new Hono();
  app.get('/healthz', async (context) => {
    const database = await options.ordersRuntime?.databaseStatus();
    return context.json(
      {
        ok: database ? database.status === 'active' : false,
        resources: database ? [database] : [],
        app: {
          name: appName,
          basePath: publicBasePath,
          releaseId: options.releaseId ?? null,
        },
      },
      database?.status === 'active' ? 200 : 503,
    );
  });
  app.route(
    apiPath,
    options.ordersRuntime
      ? createOrdersApiRoutes(options.ordersRuntime)
      : new Hono(),
  );
  registerSpaRoutes(app, {
    basePath: internalBasePath,
    handler: options.clientHandler,
    indexPath:
      options.clientIndexPath ?? path.resolve(process.cwd(), 'index.html'),
    runtimeGlobals: createPortalSpaRuntimeGlobals({
      appBasePath: publicBasePath,
      apiUrl: options.browserApiUrl ?? joinBasePath(publicBasePath, '/api'),
    }),
  });
  return app;
}

export { joinBasePath, normalizeBasePath };
