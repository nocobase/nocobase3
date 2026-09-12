import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';

import { RoutesExampleProvider } from './components/routes-example-provider.js';

export const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    {
      name: 'routes-example',
      component: RoutesExampleProvider,
    },
  ]);

export default reactProviders;
