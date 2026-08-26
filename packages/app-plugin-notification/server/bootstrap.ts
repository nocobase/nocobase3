import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';

import type { NotificationService } from './types.js';

export interface NotificationPluginServices {
  readonly notification: NotificationService | undefined;
}

export type NotificationPluginServerContext = AppPluginServerContext<
  unknown,
  NotificationPluginServices
>;

export default function bootstrapNotificationPlugin({
  lifecycle,
  services,
}: NotificationPluginServerContext): void {
  const notification = services.notification;
  if (!notification) return;

  lifecycle.registerDisposer('manager', () => notification.close());
}
