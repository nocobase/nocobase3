import { Hono } from 'hono';
import { requestLogger } from '@nocobase/logging';
import { createCoreFilesRoute } from '@nocobase/app-plugin-files/server';

import type { AppServices } from '@/services/index.js';
import type { AppDeps } from '../../runtime/deps.js';
import { createAppSettingsRoutes } from './app-settings.js';
import { createAppsHandler } from './apps.js';
import { createCacheRoutes } from './cache.js';
import { createApiErrorHandler } from './errors.js';
import { createHealthzHandler } from './healthz.js';
import { createSessionRoutes } from './session.js';
import { createAuthRoutes } from './auth.js';

export interface ApiRouteOptions {
  appName: string;
  publicBasePath: string;
  deps: AppDeps;
  services: AppServices;
}

export function createApiRoutes({
  appName,
  publicBasePath,
  deps,
  services,
}: ApiRouteOptions): Hono {
  const api = new Hono();

  api.use(
    '*',
    requestLogger({
      logger: deps.logging.getLogger('request'),
      app: appName,
      skip: (context) => context.req.path.endsWith('/api/healthz'),
    }),
  );
  const publicRoutes = new Hono();
  publicRoutes.route('/auth', createAuthRoutes(deps.auth));
  publicRoutes.get(
    '/healthz',
    createHealthzHandler({ appName, publicBasePath }),
  );
  publicRoutes.route('/cache', createCacheRoutes({ caching: deps.caching }));
  publicRoutes.route('/session', createSessionRoutes());
  publicRoutes.route(
    '/app-settings',
    createAppSettingsRoutes({ appSettingsStore: services.appSettingsStore }),
  );
  if (deps.filesRuntime) {
    publicRoutes.route('/files', createCoreFilesRoute(deps.filesRuntime));
  }
  const protectedRoutes = new Hono();
  protectedRoutes.use('*', deps.auth.required());
  protectedRoutes.get('/apps', createAppsHandler());

  api.onError(
    createApiErrorHandler({
      logger: deps.logging.getLogger().child({ module: 'api' }),
    }),
  );
  api.route('/', publicRoutes);
  api.route('/', protectedRoutes);

  return api;
}
