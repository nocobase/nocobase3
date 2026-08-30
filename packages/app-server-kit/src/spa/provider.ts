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
import { createNocoBaseSpaRuntimeGlobals } from './runtime-globals.js';

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
      runtimeGlobals: createNocoBaseSpaRuntimeGlobals({
        appBasePath: app.publicBasePath,
        apiUrl: joinBasePath(app.publicBasePath, '/api'),
        ...spa.runtime,
      }),
    });
    return router;
  });
