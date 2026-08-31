import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { BellRing, FileClock } from 'lucide-react';

export const NOTIFICATION_LOGS_RESOURCE: string = 'notification.logs';

const routes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'notifications',
    path: '/notifications',
    navigation: { title: 'Notifications', icon: BellRing },
    children: [
      {
        name: 'logs',
        path: '/logs',
        navigation: { title: 'Notification logs', icon: FileClock },
        access: {
          resource: NOTIFICATION_LOGS_RESOURCE,
          action: 'access',
        },
        componentLoader: () => import('./pages/notification-logs-page.js'),
      },
    ],
  },
]);

export default routes;
