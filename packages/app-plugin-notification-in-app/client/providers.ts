import {
  defineClientProviders,
  type AppClientProviderDefinition,
} from '@nocobase/app-client/plugins';

import { InAppNotificationProvider } from './runtime.js';

const providers: readonly AppClientProviderDefinition[] = defineClientProviders(
  [
    {
      name: 'notification-in-app',
      component: InAppNotificationProvider,
    },
  ],
);

export default providers;
