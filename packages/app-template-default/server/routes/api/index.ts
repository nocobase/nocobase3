import { Hono, type MiddlewareHandler } from 'hono';
import { matchedRoutes } from 'hono/route';
import { requestLogger } from '@nocobase/logging';

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
  const protectedRoutes = new Hono();
  protectedRoutes.use('*', authenticateMatchedRoute(deps.auth.required()));
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

function authenticateMatchedRoute(auth: MiddlewareHandler): MiddlewareHandler {
  return (context, next) =>
    matchedRoutes(context).some((route) => route.method !== 'ALL')
      ? auth(context, next)
      : next();
}
