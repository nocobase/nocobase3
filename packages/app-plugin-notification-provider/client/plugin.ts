import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import reactWrappers from './react-wrappers.js';
import routes from './routes.js';
import serviceProviders from './service-provider.js';

export interface NotificationProviderClientOptions {
  /** Label of the undo action in undoable (progress) notifications. */
  readonly undoLabel?: string;
}

const notificationProvider: AppClientPluginFactory<NotificationProviderClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-notification-provider',
    serviceProviders,
    routes,
    reactWrappers,
  });

export default notificationProvider;
