import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';

import { __NOCOBASE_SYMBOL_NAME__ServiceProvider } from './__NOCOBASE_SHORT_NAME__.js';

export const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  __NOCOBASE_SYMBOL_NAME__ServiceProvider,
];

export default serviceProviders;
