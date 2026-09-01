import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';

import { HubServiceProvider } from './hub.js';

export const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  HubServiceProvider,
];

export default serviceProviders;
