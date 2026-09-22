import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';
import { defineInAppChannelConfig } from '@nocobase/app-plugin-notification-in-app/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({
    channels: [
      defineInAppChannelConfig({
        enabled: true,
        providers: [{ type: 'database', name: 'default' }],
      }),
    ],
  }),
);

export default notification;
