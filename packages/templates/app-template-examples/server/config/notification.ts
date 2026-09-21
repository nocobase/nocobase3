import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';

const notification: AppConfigFactory<NotificationConfig> = defineAppConfig(
  (_runtime) => ({ channels: { inbox: { provider: 'in-app' } } }),
);

export default notification;
