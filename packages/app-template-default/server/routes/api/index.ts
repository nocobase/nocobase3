import { Hono } from 'hono';
import { cachingToken } from '@nocobase/caching';
import { loggingToken, requestLogger } from '@nocobase/logging';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { ServiceResolver } from '@nocobase/service-provider';

import {
  appSettingsRepositoryToken,
  publicFilesRepositoryToken,
} from '../../providers/index.js';
import { createAppSettingsRoutes } from './app-settings.js';
import { createAppsHandler } from './apps.js';
import { createCacheRoutes } from './cache.js';
import { createApiErrorHandler } from './errors.js';
import { createHealthzHandler } from './healthz.js';
import { createSessionRoutes } from './session.js';
import { createUploadRoutes } from './upload.js';
import { createAuthRoutes } from './auth.js';

export interface ApiRouteOptions {
  appName: string;
  publicBasePath: string;
  container: ServiceResolver;
}

export function createApiRoutes({
  appName,
  publicBasePath,
  container,
}: ApiRouteOptions): Hono {
  const api = new Hono();
  const auth = container.resolve(authenticationToken);
  const caching = container.resolve(cachingToken);
  const logging = container.resolve(loggingToken);
  const appSettings = container.resolve(appSettingsRepositoryToken);
  const publicFiles = container.resolve(publicFilesRepositoryToken);

  api.use(
    '*',
    requestLogger({
      logger: logging.getLogger('request'),
      app: appName,
      skip: (context) => context.req.path.endsWith('/api/healthz'),
    }),
  );
  const publicRoutes = new Hono();
  publicRoutes.route('/auth', createAuthRoutes(auth));
  publicRoutes.get(
    '/healthz',
    createHealthzHandler({ appName, publicBasePath }),
  );
  publicRoutes.route('/cache', createCacheRoutes({ caching }));
  publicRoutes.route('/session', createSessionRoutes());
  publicRoutes.route('/app-settings', createAppSettingsRoutes({ appSettings }));
  publicRoutes.route('/upload', createUploadRoutes({ publicFiles }));

  const protectedRoutes = new Hono();
  protectedRoutes.use('*', auth.required());
  protectedRoutes.get('/apps', createAppsHandler());
  api.onError(
    createApiErrorHandler({
      logger: logging.getLogger().child({ module: 'api' }),
    }),
  );
  api.route('/', publicRoutes);
  api.route('/', protectedRoutes);

  return api;
}
