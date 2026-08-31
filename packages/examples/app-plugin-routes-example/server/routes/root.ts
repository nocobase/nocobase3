import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineRootRoutes,
  type AppRootRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

export const rootRoutes: AppRootRouteContribution<AppPluginApplication> =
  defineRootRoutes(({ container }) => {
    const router = new Hono();
    const authentication = container.resolve(authenticationToken);

    router.use('/routes-example/root', authentication.required());
    router.get('/routes-example/root', (context) =>
      context.json({
        scope: 'root',
        plugin: '@nocobase/app-plugin-routes-example',
        message: 'Hello from the routes example root route',
      }),
    );

    return router;
  });
