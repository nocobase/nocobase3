import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { __NOCOBASE_MODULE_NAME__ServiceToken } from './token.js';

const __NOCOBASE_MODULE_NAME__ApiRoutes: AppApiRoutes<AppPluginApplication> =
  defineApiRoutes({
    name: __NOCOBASE_API_ROUTES_NAME_LITERAL__,
    register(router, { container }): void {
      const routes = new Hono();

      routes.get('/', (context) => {
        const service = container.resolve(__NOCOBASE_MODULE_NAME__ServiceToken);

        return context.json({
          plugin: __NOCOBASE_PACKAGE_NAME_LITERAL__,
          message: service.getMessage(),
        });
      });

      router.route(__NOCOBASE_ROUTE_PATH_LITERAL__, routes);
    },
  });

export default __NOCOBASE_MODULE_NAME__ApiRoutes;
