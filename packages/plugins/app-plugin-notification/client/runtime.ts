import {
  createApiClient,
  resolveAppUrl,
  type ApiClient,
} from '@nocobase/app-client';

import { NotificationClient } from './notification-client.js';

let notificationClient: NotificationClient | undefined;

export function configureNotificationClient(
  api: ApiClient,
): NotificationClient {
  notificationClient = new NotificationClient(api);
  return notificationClient;
}

export function getNotificationClient(): NotificationClient {
  notificationClient ??= new NotificationClient(
    createApiClient({ baseURL: resolveAppUrl('/api') }),
  );
  return notificationClient;
}
