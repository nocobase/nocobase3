import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type {
  NotificationExtensionRegistry,
  NotificationService,
} from './types.js';

export const notificationServiceToken: ServiceToken<NotificationService> =
  createServiceToken<NotificationService>(
    '@nocobase/app-plugin-notification/service',
  );

export const notificationExtensionRegistryToken: ServiceToken<NotificationExtensionRegistry> =
  createServiceToken<NotificationExtensionRegistry>(
    '@nocobase/app-plugin-notification/extension-registry',
  );
