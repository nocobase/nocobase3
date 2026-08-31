import {
  defineClientReactWrappers,
  type AppClientReactWrapperDefinition,
} from '@nocobase/app-client/plugins';

import { NotificationHost } from './components/notification-host.js';

export const reactWrappers: readonly AppClientReactWrapperDefinition[] =
  defineClientReactWrappers([
    {
      name: 'notification-host',
      component: NotificationHost,
    },
  ]);

export default reactWrappers;
