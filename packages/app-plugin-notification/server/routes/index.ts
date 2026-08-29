import { Hono } from 'hono';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import type { NotificationProviderApplicationConfig } from '../providers/notification.js';
import { notificationServiceToken } from '../tokens.js';

export const apiRoutes: AppApiRouteContribution<
  AppPluginApplication<NotificationProviderApplicationConfig>
> = defineApiRoutes(({ container }) => {
  const router = new Hono();
  if (!container.has(notificationServiceToken)) return router;
  const notification = container.resolve(notificationServiceToken);
  const auth = container.resolve(authenticationToken);

  const routes = new Hono();
  const authRequired = auth.required();
  routes.use('/logs/:id?', authRequired);
  routes.route('/', notification.router);
  router.route('/notifications', routes);
  return router;
});

const routes: readonly AppApiRouteContribution<
  AppPluginApplication<NotificationProviderApplicationConfig>
>[] = [apiRoutes];

export default routes;
