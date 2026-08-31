import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { createInAppRouter } from '../router.js';
import { inAppNotificationStoreToken } from '../tokens.js';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    if (!container.has(notificationServiceToken)) return router;
    if (!container.has(inAppNotificationStoreToken)) return router;
    const store = container.resolve(inAppNotificationStoreToken);
    const auth = container.resolve(authenticationToken);

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
    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
