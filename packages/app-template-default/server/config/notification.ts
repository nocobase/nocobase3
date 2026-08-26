import {
  defineConfig,
  type ConfigFactory,
} from '@nocobase/app-server-kit/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification';

const notificationConfig: ConfigFactory<NotificationConfig> = defineConfig(
  (): NotificationConfig => ({ channels: [] }),
);

export default notificationConfig;
