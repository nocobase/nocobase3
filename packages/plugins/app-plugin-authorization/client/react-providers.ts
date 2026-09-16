import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';

import { AuthorizationProvider } from './authorization-provider.js';

export const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    {
      name: 'authorization',
      after: ['@nocobase/app-plugin-authentication:authentication'],
      component: AuthorizationProvider,
    },
  ]);

export default reactProviders;
