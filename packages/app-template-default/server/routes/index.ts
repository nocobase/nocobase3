import type { Hono } from 'hono';

import { createSessionMiddleware } from '@nocobase/session';

import type { AppDeps } from '../runtime/deps.js';
import type { AppServices } from '../services/index.js';
import { createApiRoutes, type ApiRoutes } from './api/index.js';
import { createHelloPageHandler } from './hello.js';

export interface RegisterAppRoutesOptions {
  appName: string;
  publicBasePath: string;
  deps: AppDeps;
  services: AppServices;
}

export function registerAppRoutes(
  app: Hono,
  options: RegisterAppRoutesOptions,
): ApiRoutes {
  app.use('*', createSessionMiddleware(options.deps.sessionManager));

  app.get('/hello', createHelloPageHandler());

  return createApiRoutes({
    appName: options.appName,
    publicBasePath: options.publicBasePath,
    deps: options.deps,
    services: options.services,
  });
}
