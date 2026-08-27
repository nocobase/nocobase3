import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';

import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';

import type { NotificationPluginServices } from '../bootstrap.js';

export interface NotificationPluginRoutesDeps {
  readonly auth: {
    required(): MiddlewareHandler;
  };
}

export type NotificationPluginRoutesContext = AppPluginRoutesContext<
  NotificationPluginRoutesDeps,
  NotificationPluginServices
>;

export default function registerNotificationRoutes({
  app,
  deps,
  services,
}: NotificationPluginRoutesContext): void {
  if (!services.notification) return;

  const routes = new Hono();
  const authRequired = deps.auth.required();
  routes.use('/logs/:id?', authRequired);
  routes.route('/', services.notification.router);
  app.route('/api/notifications', routes);
}
