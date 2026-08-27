import {
  defineClientModule,
  type AppClientModuleFactory,
} from '@nocobase/app-client/plugins';

export interface NotificationProviderClientOptions {
  /** Label of the undo action in undoable (progress) notifications. */
  readonly undoLabel?: string;
}

const notificationProvider: AppClientModuleFactory<NotificationProviderClientOptions> =
  defineClientModule({
    packageName: '@nocobase/app-plugin-notification-provider',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });

export default notificationProvider;
