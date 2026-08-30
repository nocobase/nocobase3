import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

export interface RoutesExampleAuthentication {
  required(): ReturnType<Auth['required']>;
}

export function registerRoutesExampleRoutes(
  router: Hono,
  authentication: RoutesExampleAuthentication,
): void {
  router.use('/routes-example', authentication.required());
  router.get('/routes-example', (context) =>
    context.json({
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example plugin',
    }),
  );
}

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    registerRoutesExampleRoutes(router, container.resolve(authenticationToken));
    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
