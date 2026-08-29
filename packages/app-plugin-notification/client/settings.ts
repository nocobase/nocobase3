import {
  defineClientSettings,
  type AppClientSettingDefinition,
} from '@nocobase/app-client/plugins';
import { BellRing, FileClock } from 'lucide-react';

export const NOTIFICATION_LOGS_RESOURCE: string = 'notification.logs';

const settings: readonly AppClientSettingDefinition[] = defineClientSettings([
  {
    id: 'notifications',
    title: 'Notifications',
    icon: BellRing,
    children: [
      {
        id: 'logs',
        title: 'Notification logs',
        icon: FileClock,
        access: {
          resource: NOTIFICATION_LOGS_RESOURCE,
          action: 'access',
        },
        pageLoader: () => import('./pages/notification-logs-page.js'),
      },
    ],
  },
]);

export default settings;
