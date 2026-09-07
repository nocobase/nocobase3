import { Hono } from 'hono';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { auditServiceToken } from '@nocobase/app-plugin-audit/server';

// This fixed, non-sensitive status response is available to every signed-in user.
// Private business data requires its own resource/action authorization as well.
export const auditExampleRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const routes = new Hono();
    const audit = container.resolve(auditServiceToken);
    const authentication = container.resolve(authenticationToken);
    routes.get(
      '/audit-example/status',
      audit.http({ action: 'audit-example.status' }),
      authentication.required(),
      (context) => context.json({ available: true }),
    );
    return routes;
  });
