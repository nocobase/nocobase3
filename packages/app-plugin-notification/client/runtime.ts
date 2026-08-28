import { createAppClient, type AppClient } from '@nocobase/app-sdk';

import { NotificationClient } from './notification-client.js';

let notificationClient: NotificationClient | undefined;

export function configureNotificationClient(
  appClient: AppClient,
): NotificationClient {
  notificationClient = new NotificationClient(appClient);
  return notificationClient;
}

export function getNotificationClient(): NotificationClient {
  notificationClient ??= new NotificationClient(createAppClient());
  return notificationClient;
}
