import { Hono } from 'hono';
import {
  defineRootRoutes,
  type AppRootRouteContribution,
} from '../router/index.js';

import { registerSpaRoutes } from './routes.js';
import type { SpaHandler, SpaRuntimeGlobals } from './types.js';

export interface SpaProviderConfig {
  readonly app: {
    readonly internalBasePath: string;
  };
  readonly spa: {
    readonly handler?: SpaHandler;
    readonly indexPath: string;
    readonly runtimeGlobals?: SpaRuntimeGlobals;
  };
}

export interface SpaRoutesApplication {
  readonly config: SpaProviderConfig;
}

export const spaRootRoutes: AppRootRouteContribution<SpaRoutesApplication> =
  defineRootRoutes((app: SpaRoutesApplication): Hono => {
    const router = new Hono();

    registerSpaRoutes(router, {
      basePath: app.config.app.internalBasePath,
      handler: app.config.spa.handler,
      indexPath: app.config.spa.indexPath,
      runtimeGlobals: app.config.spa.runtimeGlobals,
    });
    return router;
  });
