import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface NotificationProviderClientOptions {
  /** Label of the undo action in undoable (progress) notifications. */
  readonly undoLabel?: string;
  /** Enables the development-only Refine notification demonstration page. */
  readonly enableDemoRoute?: boolean;
}

const notificationProvider: AppClientPluginFactory<NotificationProviderClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-notification-provider',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });

export default notificationProvider;
