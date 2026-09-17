import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { __NOCOBASE_SYMBOL_NAME__JobsProvider } from './__NOCOBASE_SHORT_NAME__-jobs.js';
import { __NOCOBASE_SYMBOL_NAME__Provider } from './__NOCOBASE_SHORT_NAME__.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  __NOCOBASE_SYMBOL_NAME__Provider,
  __NOCOBASE_SYMBOL_NAME__JobsProvider,
];

export default serviceProviders;
