import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import { Hono, type MiddlewareHandler } from 'hono';

import { notificationPluginServiceToken } from '../service.js';

interface NotificationRoutesDeps {
  readonly auth: { required(): MiddlewareHandler };
}

type NotificationRoutesContext = AppPluginRoutesContext<NotificationRoutesDeps>;

export default function registerRoutes({
  app,
  deps,
  pluginServices,
}: NotificationRoutesContext): void {
  const service = pluginServices.get(notificationPluginServiceToken);
  if (!service) return;

  const routes = new Hono();
  routes.use('*', deps.auth.required());
  routes.route('/', service.manager.router);
  app.route('/api/notifications', routes);
}
