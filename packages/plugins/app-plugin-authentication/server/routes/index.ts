import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { authenticationToken } from '../tokens.js';
import type { AuthenticationProviderConfig } from '../providers/authentication.js';
import { handleAuditedAuthentication } from '../audit-internal.js';

export const apiRoutes: AppApiRouteContribution<
  AppPluginApplication<AuthenticationProviderConfig>
> = defineApiRoutes((app) => {
  const router = new Hono();

  const auth = app.container.resolve(authenticationToken);
  router.post(
    '/auth/sign-in/email',
    auth.auditHttp({ action: 'authentication.sign-in' }),
  );
  router.post(
    '/auth/sign-in/username',
    auth.auditHttp({ action: 'authentication.sign-in' }),
  );
  router.post(
    '/auth/sign-up/email',
    auth.auditHttp({ action: 'authentication.sign-up' }),
  );
  router.post(
    '/auth/sign-out',
    auth.auditHttp({ action: 'authentication.sign-out' }),
  );
  router.on(['GET', 'POST'], '/auth/*', (context) =>
    handleAuditedAuthentication(auth, context),
  );
  return router;
});

const routes: readonly AppApiRouteContribution<
  AppPluginApplication<AuthenticationProviderConfig>
>[] = [apiRoutes];

export default routes;
