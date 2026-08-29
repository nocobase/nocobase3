import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import { InAppNotificationProvider } from './in-app-notification.js';

const providers: readonly AppPluginProviderConstructor[] = [
  InAppNotificationProvider,
];

export default providers;
