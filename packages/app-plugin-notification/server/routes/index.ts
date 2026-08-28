import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';

import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';

import type { NotificationPluginServices } from '../bootstrap.js';

export interface NotificationPluginRoutesDeps {
  readonly auth: {
    required(): MiddlewareHandler;
  };
  readonly authz: {
    middleware(): MiddlewareHandler<NotificationAuthorizationEnv>;
  };
}

interface NotificationAuthorizationEnv {
  Variables: {
    authz: {
      can(input: {
        resource: { type: string; id: string };
        action: string;
      }): Promise<boolean>;
    };
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

  const routes = new Hono<NotificationAuthorizationEnv>();
  const authRequired = deps.auth.required();
  routes.use('/logs/:id?', authRequired, deps.authz.middleware());
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
  routes.route('/', services.notification.router);
  app.route('/api/notifications', routes);
}
