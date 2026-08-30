import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineRootRoutes,
  type AppRootRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import type { RoutesExampleAuthentication } from './api.js';

export function registerRoutesExampleRootRoutes(
  router: Hono,
  authentication: RoutesExampleAuthentication,
): void {
  router.use('/routes-example/root', authentication.required());
  router.get('/routes-example/root', (context) =>
    context.json({
      scope: 'root',
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example root route',
    }),
  );
}

export const rootRoutes: AppRootRouteContribution<AppPluginApplication> =
  defineRootRoutes(({ container }) => {
    const router = new Hono();
    registerRoutesExampleRootRoutes(
      router,
      container.resolve(authenticationToken),
    );
    return router;
  });
