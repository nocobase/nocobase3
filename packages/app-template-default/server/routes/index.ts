import type { Hono } from 'hono';

import { createSessionMiddleware } from '@nocobase/session';

import type { AppDeps } from '../runtime/deps.js';
import type { AppServices } from '../services/index.js';
import { createApiRoutes } from './api/index.js';
import { createHelloPageHandler } from './hello.js';
import { createRealtimePageHandler } from './realtime.js';

export interface RegisterAppRoutesOptions {
  appName: string;
  publicBasePath: string;
  deps: AppDeps;
  services: AppServices;
}

export function registerAppRoutes(
  app: Hono,
  options: RegisterAppRoutesOptions,
): void {
  app.use('*', createSessionMiddleware(options.deps.sessionManager));

  app.get('/hello', createHelloPageHandler());
  app.get(
    '/realtime',
    createRealtimePageHandler({ publicBasePath: options.publicBasePath }),
  );

  app.route(
    '/api',
    createApiRoutes({
      appName: options.appName,
      publicBasePath: options.publicBasePath,
      deps: options.deps,
      services: options.services,
    }),
  );
}
