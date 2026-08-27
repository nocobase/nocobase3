import type { AppClientBootstrap } from '@nocobase/app-client/plugins';

import type { NotificationProviderClientOptions } from './module.js';
import { createNotificationProvider } from './notification-provider.js';

const bootstrap: AppClientBootstrap<NotificationProviderClientOptions> = ({
  refine,
  options,
}) => {
  refine.setNotificationProvider(createNotificationProvider(options));
};

export default bootstrap;
