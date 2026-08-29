import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { __NOCOBASE_MODULE_NAME__ServiceToken } from '../tokens.js';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();

    router.get(__NOCOBASE_ROUTE_PATH_LITERAL__, (context) => {
      const service = container.resolve(__NOCOBASE_MODULE_NAME__ServiceToken);

      return context.json({
        plugin: __NOCOBASE_PACKAGE_NAME_LITERAL__,
        message: service.getMessage(),
      });
    });

    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
