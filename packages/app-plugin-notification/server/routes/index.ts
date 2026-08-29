import { Hono } from 'hono';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { ServiceContainer } from '@nocobase/service-provider';
import { notificationServiceToken } from '../token.js';

export interface NotificationRoutesApplication {
  readonly container: ServiceContainer;
}

export default function registerNotificationRoutes(
  app: NotificationRoutesApplication,
  router: Hono,
): void {
  if (!app.container.has(notificationServiceToken)) return;
  const notification = app.container.resolve(notificationServiceToken);
  const auth = app.container.resolve(authenticationToken);

  const routes = new Hono();
  const authRequired = auth.required();
  routes.use('/logs/:id?', authRequired);
  routes.route('/', notification.router);
  router.route('/notifications', routes);
}
