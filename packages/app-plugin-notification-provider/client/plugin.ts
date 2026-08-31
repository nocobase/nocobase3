import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import reactWrappers from './react-wrappers.js';
import routes from './routes.js';
import { NotificationProviderServiceProvider } from './service-provider.js';

export interface NotificationProviderClientOptions {
  /** Label of the undo action in undoable (progress) notifications. */
  readonly undoLabel?: string;
}

const notificationProvider: AppClientPluginFactory<NotificationProviderClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-notification-provider',
    serviceProviders: [NotificationProviderServiceProvider],
    routes,
    reactWrappers,
  });

export default notificationProvider;
