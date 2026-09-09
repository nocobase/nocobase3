import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { schedulerServiceToken } from '../tokens.js';

export const SCHEDULER_ACCESS_RESOURCE: string = 'scheduler.schedules';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const schedules = new Hono<AuthorizationEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const scheduler = container.resolve(schedulerServiceToken);

    schedules.use('*', authentication.required(), authorization.middleware());
    schedules.use('*', async (context, next) => {
      const allowed = await context.get('authz').can({
        resource: { type: 'page', id: SCHEDULER_ACCESS_RESOURCE },
        action: 'access',
      });
      if (!allowed)
        return context.json({ error: 'Schedule access is required.' }, 403);
      await next();
    });
    schedules.get('/', async (context) =>
      context.json({ data: await scheduler.list() }),
    );
    schedules.get('/:id/occurrences', async (context) =>
      context.json({
        data: await scheduler.listOccurrences(context.req.param('id')),
      }),
    );
    router.route('/schedules', schedules);
    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];
export default routes;
