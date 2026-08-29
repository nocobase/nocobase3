import { Hono } from 'hono';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
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
  const authorization = app.container.resolve(authorizationToken);

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
}
