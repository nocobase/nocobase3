import { Hono } from 'hono';
import {
  defineRootRoutes,
  type AppRootRouteContribution,
} from '../router/index.js';

import { registerSpaRoutes } from './routes.js';
import { appConfig, type AppConfigAccessor } from '../config/index.js';
import { spaConfig } from './config.js';
import { createMountedOriginProxyHandler } from '../proxy/index.js';
import { joinBasePath } from '../support/index.js';
import {
  createNocoBaseSpaRuntimeGlobals,
  type NocoBaseSpaRuntimeConfig,
} from './runtime-globals.js';
import type { SpaClientConfigMap } from './types.js';

export interface SpaRoutesApplication {
  readonly config: AppConfigAccessor;
  readonly mode: 'standalone' | 'embedded';
  readonly publicBasePath: string;
}

export const spaRootRoutes: AppRootRouteContribution<SpaRoutesApplication> =
  defineRootRoutes((app: SpaRoutesApplication): Hono => {
    const router = new Hono();
    const identity = app.config.get(appConfig);
    const spa = app.config.get(spaConfig);
    const apiUrl = joinBasePath(app.publicBasePath, '/api');
    registerSpaRoutes(router, {
      basePath: identity.internalBasePath,
      handler:
        app.mode === 'standalone' && spa.viteDevUrl
          ? createMountedOriginProxyHandler(new URL(spa.viteDevUrl), {
              publicBasePath: app.publicBasePath,
              unavailableMessage: 'Vite dev server is unavailable.',
            })
          : undefined,
      indexPath: spa.indexPath,
      clientConfig: createPublicClientConfig(
        app.config.get<SpaClientConfigMap>('client') ?? {},
        { appBasePath: app.publicBasePath, apiUrl },
      ),
      runtimeGlobals: createNocoBaseSpaRuntimeGlobals({
        appBasePath: app.publicBasePath,
        apiUrl,
        ...spa.runtime,
      }),
    });
    return router;
  });

function createPublicClientConfig(
  configured: SpaClientConfigMap,
  runtime: Pick<NocoBaseSpaRuntimeConfig, 'appBasePath' | 'apiUrl'>,
): SpaClientConfigMap {
  return {
    ...configured,
    app: {
      ...readConfigSection(configured.app),
      basePath: runtime.appBasePath,
    },
    api: {
      ...readConfigSection(configured.api),
      baseURL: runtime.apiUrl,
    },
  };
}

function readConfigSection(
  value: SpaClientConfigMap[string] | undefined,
): SpaClientConfigMap {
  return isClientConfigMap(value) ? value : {};
}

function isClientConfigMap(
  value: SpaClientConfigMap[string] | undefined,
): value is SpaClientConfigMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
