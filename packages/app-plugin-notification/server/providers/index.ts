import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import {
  NotificationProvider,
  type NotificationProviderApplicationConfig,
} from './notification.js';

const providers: readonly AppPluginProviderConstructor<NotificationProviderApplicationConfig>[] =
  [NotificationProvider];

export default providers;
