import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import type { Auth } from '@nocobase/app-plugin-authentication';
import type { NotificationPluginServices } from '@nocobase/app-plugin-notification';
import { Hono } from 'hono';

import { getInAppNotificationStore } from '../bootstrap.js';
import { createInAppRouter } from '../router.js';

export interface InAppNotificationPluginRoutesDeps {
  readonly auth: Pick<Auth, 'getSession'>;
}

export type InAppNotificationPluginRoutesContext = AppPluginRoutesContext<
  InAppNotificationPluginRoutesDeps,
  NotificationPluginServices
>;

export default function registerInAppNotificationRoutes({
  app,
  deps,
  services,
}: InAppNotificationPluginRoutesContext): void {
  const notification = services.notification;
  if (!notification) return;

  const store = getInAppNotificationStore(notification);
  if (!store) {
    throw new Error(
      'In-app notification routes require the plugin bootstrap to run first.',
    );
  }

  const routes = new Hono();
  routes.route(
    '/',
    createInAppRouter(store, {
      resolveUserId: async (request): Promise<string | undefined> => {
        const session = await deps.auth.getSession(request.headers);
        return session?.user.id;
      },
    }),
  );
  app.route('/api/notifications/in-app', routes);
}
