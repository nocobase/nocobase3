import { Hono } from 'hono';
import { requestLogger } from '@nocobase/logging';

import type { AppServices } from '@/services/index.js';
import type { AppDeps } from '../../runtime/deps.js';
import { createAppSettingsRoutes } from './app-settings.js';
import { createAppsHandler } from './apps.js';
import { createCacheRoutes } from './cache.js';
import { createApiErrorHandler } from './errors.js';
import { createHealthzHandler } from './healthz.js';
import { createQueueRoutes } from './queue.js';
import { createSessionRoutes } from './session.js';
import { createUploadRoutes } from './upload.js';

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

  api.onError(
    createApiErrorHandler({
      logger: deps.logging.getLogger().child({ module: 'api' }),
    }),
  );
  api.get('/healthz', createHealthzHandler({ appName, publicBasePath }));
  api.get('/apps', createAppsHandler());
  api.route('/cache', createCacheRoutes({ caching: deps.caching }));
  api.route('/queue', createQueueRoutes({ queueManager: deps.queueManager }));
  api.route('/session', createSessionRoutes());
  api.route('/app-settings', createAppSettingsRoutes({ appSettingsStore: services.appSettingsStore }));
  api.route('/upload', createUploadRoutes({ publicFileStorage: services.publicFileStorage }));

  return api;
}
