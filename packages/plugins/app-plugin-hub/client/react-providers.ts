import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';

import { HubApplicationsProvider } from './components/hub-applications-provider.js';

export const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    {
      name: 'hub-applications',
      component: HubApplicationsProvider,
    },
  ]);

export default reactProviders;
