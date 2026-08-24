import {
  defineClientProviders,
  type AppClientProviderDefinition,
} from '@nocobase/app-client/plugins';

import { NotificationHost } from './components/notification-host.js';

const providers: readonly AppClientProviderDefinition[] = defineClientProviders(
  [
    {
      name: 'notification-host',
      component: NotificationHost,
    },
  ],
);

export default providers;
