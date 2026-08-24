import {
  defineClientProviders,
  type AppClientProviderDefinition,
} from '@nocobase/app-client/plugins';

import { RoutesExampleProvider } from './components/routes-example-provider.js';

const providers: readonly AppClientProviderDefinition[] = defineClientProviders(
  [
    {
      name: 'routes-example',
      component: RoutesExampleProvider,
    },
  ],
);

export default providers;
