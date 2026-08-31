import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import routes from './routes.js';
import { NotificationServiceProvider } from './service-provider.js';

export interface NotificationClientOptions {
  readonly placeholder?: never;
}

const notification: AppClientPluginFactory<NotificationClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-notification',
    serviceProviders: [NotificationServiceProvider],
    routes,
  });

export default notification;
