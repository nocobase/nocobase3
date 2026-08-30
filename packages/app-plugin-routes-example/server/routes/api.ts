import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

export interface RoutesExampleAuthentication {
  required(): ReturnType<Auth['required']>;
}

export function registerRoutesExampleApiRoutes(
  router: Hono,
  authentication: RoutesExampleAuthentication,
): void {
  router.use('/routes-example', authentication.required());
  router.get('/routes-example', (context) =>
    context.json({
      scope: 'api',
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example API route',
    }),
  );
}

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    registerRoutesExampleApiRoutes(
      router,
      container.resolve(authenticationToken),
    );
    return router;
  });
