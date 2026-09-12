import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import NotificationProvidersProvider from '../provider.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  NotificationProvidersProvider,
];

export default serviceProviders;
