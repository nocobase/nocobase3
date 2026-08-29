import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import { __NOCOBASE_SYMBOL_NAME__Provider } from './__NOCOBASE_SHORT_NAME__.js';

const providers: readonly AppPluginProviderConstructor[] = [
  __NOCOBASE_SYMBOL_NAME__Provider,
];

export default providers;
