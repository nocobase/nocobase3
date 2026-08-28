import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import type { AppPluginRoutesApplication } from '@nocobase/app-server-kit/plugins';
import { Hono } from 'hono';

import { createInAppRouter } from '../router.js';
import { inAppNotificationStoreToken } from '../token.js';

export default function registerInAppNotificationRoutes(
  app: AppPluginRoutesApplication,
): void {
  if (!app.container.has(notificationServiceToken)) return;
  if (!app.container.has(inAppNotificationStoreToken)) return;
  const store = app.container.resolve(inAppNotificationStoreToken);
  const auth = app.container.resolve(authenticationToken);

  const routes = new Hono();
  routes.route(
    '/',
    createInAppRouter(store, {
      resolveUserId: async (request): Promise<string | undefined> => {
        const session = await auth.getSession(request.headers);
        return session?.user.id;
      },
    }),
  );
  app.router.route('/api/notifications/in-app', routes);
}
