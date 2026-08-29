import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import type { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';

import { createInAppRouter } from '../router.js';
import { inAppNotificationStoreToken } from '../token.js';

export interface InAppNotificationRoutesApplication {
  readonly container: ServiceContainer;
}

export default function registerInAppNotificationRoutes(
  app: InAppNotificationRoutesApplication,
  router: Hono,
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
  router.route('/notifications/in-app', routes);
}
