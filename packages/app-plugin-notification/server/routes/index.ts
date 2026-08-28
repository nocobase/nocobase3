import { Hono } from 'hono';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginRoutesApplication } from '@nocobase/app-server-kit/plugins';
import { notificationServiceToken } from '../token.js';

export default function registerNotificationRoutes(
  app: AppPluginRoutesApplication,
): void {
  if (!app.container.has(notificationServiceToken)) return;
  const notification = app.container.resolve(notificationServiceToken);
  const auth = app.container.resolve(authenticationToken);

  const routes = new Hono();
  const authRequired = auth.required();
  routes.use('/logs/:id?', authRequired);
  routes.route('/', notification.router);
  app.router.route('/api/notifications', routes);
}
