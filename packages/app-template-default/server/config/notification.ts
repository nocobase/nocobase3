import {
  defineConfig,
  type ConfigFactory,
} from '@nocobase/app-server-kit/config';
import {
  defineEmailChannelConfig,
  defineSmtpProviderConfig,
  type EmailChannelConfig,
} from '@nocobase/app-plugin-notification-providers';
import {
  defineInAppChannelConfig,
  type InAppChannelConfig,
} from '@nocobase/app-plugin-notification-in-app';

export interface AppNotificationConfig {
  readonly enabled: boolean;
  readonly channels: readonly [InAppChannelConfig, EmailChannelConfig];
}

const notificationConfig: ConfigFactory<AppNotificationConfig> = defineConfig(
  ({ env }): AppNotificationConfig => {
    const smtpUser = env.string('SMTP_USER', '');
    const smtpPassword = env.string('SMTP_PASSWORD', '');
    return {
      enabled: env.boolean('NOTIFICATION_ENABLED', false),
      channels: [
        defineInAppChannelConfig({
          enabled: env.boolean('NOTIFICATION_IN_APP_ENABLED', true),
          providers: [{ type: 'database', name: 'in-app' }],
        }),
        defineEmailChannelConfig({
          enabled: env.boolean('NOTIFICATION_EMAIL_ENABLED', false),
          providers: [
            defineSmtpProviderConfig({
              name: 'primary-smtp',
              host: env.string('SMTP_HOST', '127.0.0.1'),
              port: env.number('SMTP_PORT', 587),
              secure: env.boolean('SMTP_SECURE', false),
              auth: smtpUser
                ? { user: smtpUser, pass: smtpPassword }
                : undefined,
              from: env.string('SMTP_FROM', 'notifications@example.com'),
            }),
          ],
        }),
      ],
    };
  },
);

export default notificationConfig;
