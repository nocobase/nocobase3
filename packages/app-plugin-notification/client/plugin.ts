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
    locales: () => import('./locales/index.js'),
    routes: () => import('./routes.js'),
  });

export default notification;
