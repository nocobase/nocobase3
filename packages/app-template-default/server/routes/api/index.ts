import { Hono } from 'hono';

import type { AppServices } from '@/services/index.js';
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
  services: AppServices;
}

export function createApiRoutes({
  appName,
  publicBasePath,
  services,
}: ApiRouteOptions): Hono {
  const api = new Hono();

  api.onError(
    createApiErrorHandler({
      logger: services.loggerManager.use().child({ module: 'api' }),
    }),
  );
  api.get('/healthz', createHealthzHandler({ appName, publicBasePath }));
  api.get('/apps', createAppsHandler());
  api.route('/cache', createCacheRoutes({ cacheManager: services.cacheManager }));
  api.route('/queue', createQueueRoutes({ queueManager: services.queueManager }));
  api.route('/session', createSessionRoutes());
  api.route('/app-settings', createAppSettingsRoutes({ appSettingsStore: services.appSettingsStore }));
  api.route('/upload', createUploadRoutes({ publicFileStorage: services.publicFileStorage }));

  return api;
}
