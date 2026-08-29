import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(() => {
    const router = new Hono();

    router.get('/routes-example', (context) =>
      context.json({
        plugin: '@nocobase/app-plugin-routes-example',
        message: 'Hello from the routes example plugin',
      }),
    );

    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
