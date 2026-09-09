import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';

import type { HubClientOptions } from '../plugin.js';
import { HubNavigationProvider } from './hub-navigation.js';

const serviceProviders: readonly ClientServiceProviderConstructor<HubClientOptions>[] =
  [HubNavigationProvider];

export default serviceProviders;
