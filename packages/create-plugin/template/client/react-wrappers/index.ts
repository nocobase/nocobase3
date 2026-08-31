import {
  defineClientReactWrappers,
  type AppClientReactWrapperDefinition,
} from '@nocobase/app-client/plugins';

import { __NOCOBASE_SYMBOL_NAME__Provider } from '../components/provider.js';

export const reactWrappers: readonly AppClientReactWrapperDefinition[] =
  defineClientReactWrappers([
    {
      name: __NOCOBASE_SHORT_NAME_LITERAL__,
      component: __NOCOBASE_SYMBOL_NAME__Provider,
    },
  ]);

export default reactWrappers;
