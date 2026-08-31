import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import type { NotificationProvidersPluginConfig } from '../bootstrap.js';
import NotificationProvidersProvider from '../provider.js';

const serviceProviders: readonly AppPluginProviderConstructor<NotificationProvidersPluginConfig>[] =
  [NotificationProvidersProvider];

export default serviceProviders;
