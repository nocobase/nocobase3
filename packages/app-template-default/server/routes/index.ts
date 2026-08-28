import type { Hono } from 'hono';

import type { ServiceResolver } from '@nocobase/service-provider';
import {
  createSessionMiddleware,
  sessionManagerToken,
} from '@nocobase/session';

import { createApiRoutes } from './api/index.js';
import { createHelloPageHandler } from './hello.js';

export interface AppRoutesApplication {
  readonly appName: string;
  readonly publicBasePath: string;
  readonly router: Hono;
  readonly container: ServiceResolver;
}

export function registerAppRoutes(app: AppRoutesApplication): void {
  const { appName, publicBasePath, router, container } = app;

  router.use(
    '*',
    createSessionMiddleware(container.resolve(sessionManagerToken)),
  );

  router.get('/hello', createHelloPageHandler());

  router.route(
    '/api',
    createApiRoutes({
      appName,
      publicBasePath,
      container,
    }),
  );
}
