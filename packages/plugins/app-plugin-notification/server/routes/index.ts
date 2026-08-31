import { Hono } from 'hono';

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
import { notificationServiceToken } from '../tokens.js';
import type { NotificationProviderApplicationConfig } from '../providers/notification.js';

export const apiRoutes: AppApiRouteContribution<
  AppPluginApplication<NotificationProviderApplicationConfig>
> = defineApiRoutes(({ container }) => {
  const router = new Hono();
  if (!container.has(notificationServiceToken)) return router;
  const notification = container.resolve(notificationServiceToken);
  const auth = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);

  const routes = new Hono<AuthorizationEnv>();
  routes.use('/logs/:id?', auth.required(), authorization.middleware());
  routes.use('/logs/:id?', async (context, next) => {
    const allowed = await context.get('authz').can({
      resource: { type: 'page', id: 'notification.logs' },
      action: 'access',
    });
    if (!allowed) {
      return context.json(
        { error: 'Notification logs access is required.' },
        403,
      );
    }
    await next();
  });
  routes.route('/', notification.router);
  router.route('/notifications', routes);
  return router;
});

const routes: readonly AppApiRouteContribution<
  AppPluginApplication<NotificationProviderApplicationConfig>
>[] = [apiRoutes];

export default routes;
