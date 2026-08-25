import { Hono } from 'hono';
import { requestLogger } from '@nocobase/logging';
import type { AppPluginProtectedRoutes } from '@nocobase/app-server/plugins';

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

export interface ApiRoutes {
  app: Hono;
  plugins: Hono;
  protectedRoutes: AppPluginProtectedRoutes;
  finalize(): Hono;
}

export function createApiRoutes({
  appName,
  publicBasePath,
  deps,
  services,
}: ApiRouteOptions): ApiRoutes {
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
  const pluginRoutes = new Hono();
  const protectedApp = new Hono();
  const protectedRoutes = createProtectedRoutes(protectedApp, deps);
  const apps = new Hono();
  apps.get('/', createAppsHandler());
  protectedRoutes.route('/apps', apps);

  api.onError(
    createApiErrorHandler({
      logger: deps.logging.getLogger().child({ module: 'api' }),
    }),
  );
  return {
    app: api,
    plugins: pluginRoutes,
    protectedRoutes,
    finalize(): Hono {
      api.route('/', publicRoutes);
      api.route('/', pluginRoutes);
      api.route('/', protectedApp);
      api.all('*', (context) => context.notFound());
      return api;
    },
  };
}

function createProtectedRoutes(
  routes: Hono,
  deps: AppDeps,
): AppPluginProtectedRoutes {
  return {
    route(path, app): void {
      const protectedRoute = new Hono();
      protectedRoute.use('*', deps.auth.required());
      protectedRoute.route('/', app);
      routes.route(path, protectedRoute);
    },
  };
}
