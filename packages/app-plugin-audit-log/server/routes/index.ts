import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { auditLogServiceToken } from '../tokens.js';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();

    router.get('/audit-log', (context) => {
      const service = container.resolve(auditLogServiceToken);

      return context.json({
        plugin: '@nocobase/app-plugin-audit-log',
        message: service.getMessage(),
      });
    });

    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
