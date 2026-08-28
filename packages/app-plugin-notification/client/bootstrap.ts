import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';
import { BellRing, FileClock } from 'lucide-react';
import { createElement } from 'react';

import { configureNotificationClient } from './runtime.js';

const bootstrap: AppClientPluginBootstrap = ({ appClient, refine }) => {
  configureNotificationClient(appClient);
  refine.addResources([
    {
      name: 'notification',
      meta: { label: 'Notifications', icon: createElement(BellRing) },
    },
    {
      name: 'notification.logs',
      list: '/settings/notifications/logs',
      meta: {
        label: 'Notification logs',
        parent: 'notification',
        icon: createElement(FileClock),
      },
    },
  ]);
};

export default bootstrap;
