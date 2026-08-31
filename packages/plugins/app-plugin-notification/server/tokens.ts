import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { NotificationService } from './types.js';

export const notificationServiceToken: ServiceToken<NotificationService> =
  createServiceToken<NotificationService>(
    '@nocobase/app-plugin-notification/service',
  );
