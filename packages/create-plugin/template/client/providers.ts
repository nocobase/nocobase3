import {
  defineClientProviders,
  type AppClientProviderDefinition,
} from '@nocobase/app-client/plugins';

import { __NOCOBASE_SYMBOL_NAME__Provider } from './components/provider.js';

const providers: readonly AppClientProviderDefinition[] = defineClientProviders(
  [
    {
      name: __NOCOBASE_SHORT_NAME_LITERAL__,
      component: __NOCOBASE_SYMBOL_NAME__Provider,
    },
  ],
);

export default providers;
