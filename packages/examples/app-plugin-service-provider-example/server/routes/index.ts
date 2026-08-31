import { Hono } from 'hono';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';

import { heartbeatServiceToken } from '../tokens.js';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();

    router.get('/service-provider-example/status', (context) => {
      const heartbeat = container.resolve(heartbeatServiceToken);

      return context.json({
        service: '@nocobase/app-plugin-service-provider-example',
        ...heartbeat.getState(),
      });
    });

    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
