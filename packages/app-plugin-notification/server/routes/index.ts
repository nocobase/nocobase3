import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import { Hono, type MiddlewareHandler } from 'hono';

interface NotificationRoutesDeps {
  readonly auth: { required(): MiddlewareHandler };
}

interface NotificationRoutesServices {
  readonly notification?: { readonly router: Hono };
}

type NotificationRoutesContext = AppPluginRoutesContext<
  NotificationRoutesDeps,
  NotificationRoutesServices
>;

export default function registerRoutes({
  app,
  deps,
  services,
}: NotificationRoutesContext): void {
  if (!services.notification) return;

  const routes = new Hono();
  routes.use('*', deps.auth.required());
  routes.route('/', services.notification.router);
  app.route('/api/notifications', routes);
}
