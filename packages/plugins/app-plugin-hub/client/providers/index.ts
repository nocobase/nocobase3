import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';

import { HubNavigationProvider } from './hub-navigation.js';

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  HubNavigationProvider,
];

export default serviceProviders;
