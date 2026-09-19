import locales from './locales/index.js';
import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import reactProviders from './react-providers.js';
import routes from './routes.js';
import serviceProviders from './service-provider.js';

export interface NotificationProviderClientOptions {
  /** Include the notification demo page. Defaults to true for compatibility. */
  readonly demo?: boolean;
  /** Label of the undo action in undoable (progress) notifications. */
  readonly undoLabel?: string;
}

const notificationProvider: AppClientPluginFactory<NotificationProviderClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-notification-provider',
    locales,
    serviceProviders,
    routes: (options) => (options.demo === false ? [] : routes),
    reactProviders,
  });

export default notificationProvider;
