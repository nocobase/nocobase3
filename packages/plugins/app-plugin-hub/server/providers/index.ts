import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { HubProvider } from './hub.js';
import { HubAuthorizationProvider } from './hub-authorization.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  HubProvider,
  HubAuthorizationProvider,
];

export default serviceProviders;
