import { Hono } from 'hono';
import path from 'node:path';

import {
  registerNocoBaseApiProxyRoutes,
  resolveNocoBaseApiUrl,
  createNocoBaseApiProxyHeaders,
} from '@nocobase/app-server-kit/proxy';
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

import {
  createSettingsRoutes,
  type SettingsRoutesOptions,
} from './settings/index.js';
import {
  createNativeAuthRoutes,
  type NativeAuthRuntime,
} from './native-auth/index.js';
import {
  registerAppRuntimeGatewayRoutes,
  type AppRuntimeGatewayOptions,
} from './app-runtime-gateway.js';
import { registerHubApiPlugins, type HubApiPlugin } from './api-plugin.js';

export interface CreateAppOptions {
  appName?: string;
  basePath?: string;
  browserBasePath?: string;
  browserApiUrl?: string;
  apiProxyPath?: string;
  clientHandler?: ClientHandler;
  clientIndexPath?: string;
  nocoBaseApiUrl?: string | false;
  apiClientStoragePrefix?: string;
  apiClientStorageType?: string;
  apiClientShareToken?: boolean;
  nativeAuth?: NativeAuthRuntime;
  apiPlugins?: readonly HubApiPlugin[];
  settings?: SettingsRoutesOptions;
  appRuntimeGateway?: AppRuntimeGatewayOptions;
}

export type ClientHandler = (request: Request) => Response | Promise<Response>;

export function createApp(options: CreateAppOptions = {}): Hono {
  const appName = resolveAppName(options.appName);
  const internalBasePath = normalizeBasePath(options.basePath ?? `/${appName}`);
  const publicBasePath = normalizeBasePath(
    options.browserBasePath ?? internalBasePath,
  );
  const internalApiProxyPath = resolveApiProxyPath(
    options.apiProxyPath,
    internalBasePath,
  );
  const publicApiUrl =
    options.browserApiUrl ?? joinBasePath(publicBasePath, '/api');
  const nocoBaseApiUrl = resolveNocoBaseApiUrl(options.nocoBaseApiUrl);
  const clientIndexPath =
    options.clientIndexPath ?? path.resolve(process.cwd(), 'index.html');
  const app = new Hono();

  app.get('/healthz', (context) =>
    context.json({
      ok: true,
      app: {
        name: appName,
        basePath: publicBasePath,
      },
    }),
  );

  registerNocoBaseApiProxyRoutes(app, {
    apiProxyPath: internalApiProxyPath,
    nocoBaseApiUrl,
  });

  const api = new Hono();
  api.get('/healthz', (context) =>
    context.json({
      ok: true,
      app: {
        name: appName,
        basePath: publicBasePath,
      },
      basePath: publicBasePath,
    }),
  );
  if (options.nativeAuth) {
    api.route('/auth', createNativeAuthRoutes(options.nativeAuth));
  }

  registerHubApiPlugins(api, options.apiPlugins ?? []);

  if (options.settings) {
    api.route('/settings', createSettingsRoutes(options.settings));
  }

  app.route(joinBasePath(internalBasePath, '/api'), api);

  if (options.appRuntimeGateway) {
    registerAppRuntimeGatewayRoutes(app, {
      ...options.appRuntimeGateway,
      reservedAppIds: [
        ...new Set([
          ...getBasePathSegments(internalBasePath),
          ...(options.appRuntimeGateway.reservedAppIds ?? []),
        ]),
      ],
    });
  }

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

function getBasePathSegments(basePath: string): string[] {
  return basePath.split('/').filter(Boolean);
}

export { createNocoBaseApiProxyHeaders, joinBasePath, normalizeBasePath };
