import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';

import { NotificationHost } from './components/notification-host.js';

export const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    {
      name: 'notification-host',
      component: NotificationHost,
    },
  ]);

export default reactProviders;
