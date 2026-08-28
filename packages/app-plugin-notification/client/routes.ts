import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

export const NOTIFICATION_LOGS_RESOURCE: string = 'notification.logs';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'notification-logs',
    path: '/settings/notifications/logs',
    auth: 'required',
    access: {
      resource: NOTIFICATION_LOGS_RESOURCE,
      action: 'access',
    },
    componentLoader: () => import('./pages/notification-logs-page.js'),
  },
]);

export default routes;
