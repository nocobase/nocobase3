import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { inAppNotificationAuditToken } from '../audit.js';
import { createInAppRouter } from '../router.js';
import { inAppNotificationStoreToken } from '../tokens.js';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const store = container.resolve(inAppNotificationStoreToken);
    const auth = container.resolve(authenticationToken);

    const routes = new Hono();
    if (container.has(inAppNotificationAuditToken)) {
      const audit = container.resolve(inAppNotificationAuditToken);
      routes.get('/', audit.http({ action: 'notification.inbox.list' }));
      routes.get(
        '/unread-count',
        audit.http({ action: 'notification.inbox.count' }),
      );
      routes.post(
        '/read-all',
        audit.http({ action: 'notification.inbox.readAll' }),
      );
      routes.post(
        '/:id{(?!read-all$)[^/]+}',
        audit.http({ action: 'notification.inbox.update' }),
      );
    }
    routes.route(
      '/',
      createInAppRouter(store, {
        audit: container.has(inAppNotificationAuditToken)
          ? container.resolve(inAppNotificationAuditToken)
          : undefined,
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
