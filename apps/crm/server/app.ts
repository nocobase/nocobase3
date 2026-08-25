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

import { createCrmApiRoutes } from './routes.js';
import type { CrmRuntime } from './runtime.js';

export interface CreateAppOptions {
  appName?: string;
  basePath?: string;
  browserBasePath?: string;
  browserApiUrl?: string;
  apiProxyPath?: string;
  clientHandler?: ClientHandler;
  clientIndexPath?: string;
  apiClientStoragePrefix?: string;
  apiClientStorageType?: string;
  apiClientShareToken?: boolean;
  releaseId?: string | null;
  crmRuntime?: CrmRuntime;
}

export type ClientHandler = (request: Request) => Response | Promise<Response>;

export function createApp(options: CreateAppOptions = {}): Hono {
  const appName = resolveAppName(options.appName);
  const internalBasePath = normalizeBasePath(options.basePath ?? `/${appName}`);
  const publicBasePath = normalizeBasePath(
    options.browserBasePath ?? internalBasePath,
  );
  const internalApiProxyPath = resolveApiProxyPath(
    options.apiProxyPath ?? joinBasePath(internalBasePath, '/api'),
    internalBasePath,
  );
  const publicApiUrl =
    options.browserApiUrl ?? joinBasePath(publicBasePath, '/api');
  const clientIndexPath =
    options.clientIndexPath ?? path.resolve(process.cwd(), 'index.html');
  const app = new Hono();

  app.get('/healthz', async (context) => {
    const database = await options.crmRuntime?.databaseStatus();
    return context.json(
      {
        ok: database ? database.status === 'active' : true,
        resources: database ? [database] : [],
        app: {
          name: appName,
          basePath: publicBasePath,
          releaseId: options.releaseId ?? null,
        },
      },
      database?.status === 'error' ? 503 : 200,
    );
  });

  const api = options.crmRuntime
    ? createCrmApiRoutes(options.crmRuntime)
    : createUnavailableApi(appName, publicBasePath, options.releaseId);

  app.route(internalApiProxyPath, api);

  registerSpaRoutes(app, {
    basePath: internalBasePath,
    handler: options.clientHandler,
    indexPath: clientIndexPath,
    runtimeGlobals: createPortalSpaRuntimeGlobals({
      appBasePath: publicBasePath,
      apiUrl: publicApiUrl,
      storagePrefix: options.apiClientStoragePrefix,
      storageType: options.apiClientStorageType,
      shareToken: options.apiClientShareToken,
    }),
  });

  return app;
}

function createUnavailableApi(
  appName: string,
  publicBasePath: string,
  releaseId?: string | null,
): Hono {
  const api = new Hono();
  api.get('/healthz', (context) =>
    context.json(
      {
        ok: false,
        app: {
          name: appName,
          basePath: publicBasePath,
          releaseId: releaseId ?? null,
        },
        code: 'CRM_RUNTIME_UNAVAILABLE',
      },
      503,
    ),
  );
  return api;
}

export { joinBasePath, normalizeBasePath };
