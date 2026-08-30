import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { authenticationToken } from '../tokens.js';
import type { AuthenticationProviderConfig } from '../providers/authentication.js';

export const apiRoutes: AppApiRouteContribution<
  AppPluginApplication<AuthenticationProviderConfig>
> = defineApiRoutes((app) => {
  const router = new Hono();

  const auth = app.container.resolve(authenticationToken);
  router.on(['GET', 'POST'], '/auth/*', (context) =>
    auth.handler(context.req.raw),
  );
  return router;
});

const routes: readonly AppApiRouteContribution<
  AppPluginApplication<AuthenticationProviderConfig>
>[] = [apiRoutes];

export default routes;
