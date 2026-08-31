import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import { InAppNotificationProvider } from './in-app-notification.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  InAppNotificationProvider,
];

export default serviceProviders;
