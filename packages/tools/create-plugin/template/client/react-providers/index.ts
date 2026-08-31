import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';

import { __NOCOBASE_SYMBOL_NAME__Provider } from '../components/provider.js';

export const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    {
      name: __NOCOBASE_SHORT_NAME_LITERAL__,
      component: __NOCOBASE_SYMBOL_NAME__Provider,
    },
  ]);

export default reactProviders;
