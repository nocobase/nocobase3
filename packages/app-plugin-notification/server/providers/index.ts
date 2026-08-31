import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import {
  NotificationProvider,
  type NotificationProviderApplicationConfig,
} from './notification.js';

const serviceProviders: readonly AppPluginProviderConstructor<NotificationProviderApplicationConfig>[] =
  [NotificationProvider];

export default serviceProviders;
