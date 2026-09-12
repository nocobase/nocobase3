import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { InAppStore } from './store.js';

export const inAppNotificationStoreToken: ServiceToken<InAppStore> =
  createServiceToken<InAppStore>(
    '@nocobase/app-plugin-notification-in-app/store',
  );
