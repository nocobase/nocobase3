import type { AppExtension } from '@nocobase/portal-sdk/extensions';
import { defineAppRoutes } from '@nocobase/portal-sdk/routing';
import { Bell, Mail } from 'lucide-react';

import { NotificationInAppProvider } from './in-app/runtime.js';

const notificationExtension: AppExtension = {
  id: 'nocobase-notification',
  Provider: NotificationInAppProvider,
  dev: {
    resources: [
      {
        name: 'notifications',
        meta: {
          label: 'Notifications',
          icon: <Bell />,
          description: 'Notification delivery and message center patterns.',
        },
      },
      {
        name: 'notification-in-app',
        list: 'notifications',
        meta: {
          parent: 'notifications',
          label: 'My notifications',
          icon: <Mail />,
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: 'development.notifications',
        path: 'notifications',
        children: [
          {
            name: 'development.notifications.in-app',
            index: true,
            lazy: () =>
              import('./in-app/page.js').then((module) => ({
                default: module.NotificationInAppPage,
              })),
          },
        ],
      },
    ]),
  },
  resources: [
    {
      name: 'notifications',
      list: 'notifications',
      meta: {
        label: 'Notifications',
        icon: <Bell />,
        acl: { type: 'authenticated' },
      },
    },
    {
      name: 'notification-in-app',
      list: 'notifications',
      meta: {
        parent: 'notifications',
        label: 'My notifications',
        icon: <Mail />,
        acl: { type: 'authenticated' },
      },
    },
  ],
  routes: defineAppRoutes([
    {
      name: 'notifications',
      path: 'notifications',
      meta: { acl: { type: 'authenticated' } },
      children: [
        {
          name: 'notifications.in-app',
          index: true,
          lazy: () =>
            import('./in-app/page.js').then((module) => ({
              default: module.NotificationInAppPage,
            })),
        },
      ],
    },
  ]),
};

export default notificationExtension;
