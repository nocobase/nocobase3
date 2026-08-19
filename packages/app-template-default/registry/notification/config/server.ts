import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';

import type { NotificationModuleConfig } from '../server/index.js';

const notificationConfig: ConfigFactory<NotificationModuleConfig> = defineConfig(
  ({ env }): NotificationModuleConfig => ({
    enabled: env.boolean('NOTIFICATION_ENABLED', true),
    allowNonPersistentStore: env.boolean('NOTIFICATION_ALLOW_NON_PERSISTENT_STORE', false),
  }),
);

export default notificationConfig;
