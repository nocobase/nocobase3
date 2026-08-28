import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface NotificationClientOptions {
  readonly placeholder?: never;
}

const notification: AppClientPluginFactory<NotificationClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-notification',
    bootstrap: () => import('./bootstrap.js'),
    settings: () => import('./settings.js'),
  });

export default notification;
