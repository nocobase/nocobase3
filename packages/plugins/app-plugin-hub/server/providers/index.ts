import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { HubProvider } from './hub.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  HubProvider,
];

export default serviceProviders;
