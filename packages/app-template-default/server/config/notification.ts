import {
  defineConfig,
  type ConfigEnv,
  type ConfigFactory,
} from '@nocobase/app-server-kit/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification';
import {
  defineInAppChannelConfig,
  type InAppChannelConfig,
} from '@nocobase/app-plugin-notification-in-app';
import {
  defineEmailChannelConfig,
  defineResendProviderConfig,
  defineSmtpProviderConfig,
  type EmailChannelConfig,
  type ResendProviderConfig,
  type SmtpProviderConfig,
} from '@nocobase/app-plugin-notification-providers/email';
import {
  defineDingTalkWebhookProviderConfig,
  defineFeishuWebhookProviderConfig,
  type DingTalkWebhookProviderConfig,
  type FeishuWebhookProviderConfig,
  type ImChannelConfig,
} from '@nocobase/app-plugin-notification-providers/im';

export type AppNotificationChannelConfig =
  InAppChannelConfig | EmailChannelConfig | AppImChannelConfig;

export interface AppImChannelConfig extends ImChannelConfig {
  readonly providers: readonly (
    FeishuWebhookProviderConfig | DingTalkWebhookProviderConfig
  )[];
}

export interface AppNotificationConfig extends NotificationConfig {
  readonly channels: readonly AppNotificationChannelConfig[];
  readonly test: {
    readonly enabled: boolean;
    readonly emailRecipient?: string;
  };
}

const notificationConfig: ConfigFactory<AppNotificationConfig> = defineConfig(
  ({ env }): AppNotificationConfig => createNotificationConfig(env),
);

export default notificationConfig;

export function createNotificationConfig(
  env: ConfigEnv,
): AppNotificationConfig {
  const channels: AppNotificationChannelConfig[] = [];
  const emailProviders = createEmailProviders(env);
  const imProviders = createImProviders(env);
  channels.push(
    defineInAppChannelConfig({
      enabled: true,
      providers: [{ type: 'database', name: 'primary' }],
    }),
  );

  if (emailProviders.length > 0) {
    channels.push(
      defineEmailChannelConfig({ enabled: true, providers: emailProviders }),
    );
  }
  if (imProviders.length > 0) {
    channels.push({ type: 'im', enabled: true, providers: imProviders });
  }

  return {
    channels,
    test: {
      enabled: env.boolean(
        'NOTIFICATION_PROVIDER_TEST_ENABLED',
        env.string('NODE_ENV') !== 'production',
      ),
      emailRecipient: env.string('TEST_EMAIL_RECIPIENT'),
    },
  };
}

function createEmailProviders(
  env: ConfigEnv,
): readonly (SmtpProviderConfig | ResendProviderConfig)[] {
  const providers: (SmtpProviderConfig | ResendProviderConfig)[] = [];

  if (
    hasAnyConfig(env, [
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_SECURE',
      'SMTP_USER',
      'SMTP_PASSWORD',
      'SMTP_FROM',
      'SMTP_REPLY_TO',
    ])
  ) {
    const host = required(env, 'SMTP_HOST', 'smtp');
    const from = required(env, 'SMTP_FROM', 'smtp');
    const user = env.string('SMTP_USER');
    const password = env.string('SMTP_PASSWORD');
    if (Boolean(user) !== Boolean(password)) {
      throw new Error(
        'SMTP_USER and SMTP_PASSWORD must either both be configured or both be omitted.',
      );
    }
    const port = env.number('SMTP_PORT', 587);

    providers.push(
      defineSmtpProviderConfig({
        name: 'smtp',
        host,
        port,
        secure: env.boolean('SMTP_SECURE', port === 465),
        auth: user && password ? { user, pass: password } : undefined,
        from,
        replyTo: env.string('SMTP_REPLY_TO'),
      }),
    );
  }

  if (hasAnyConfig(env, ['RESEND_API_KEY', 'RESEND_FROM', 'RESEND_REPLY_TO'])) {
    providers.push(
      defineResendProviderConfig({
        name: 'resend',
        apiKey: required(env, 'RESEND_API_KEY', 'resend'),
        from: required(env, 'RESEND_FROM', 'resend'),
        replyTo: env.string('RESEND_REPLY_TO'),
      }),
    );
  }

  return providers;
}

function createImProviders(
  env: ConfigEnv,
): readonly (FeishuWebhookProviderConfig | DingTalkWebhookProviderConfig)[] {
  const providers: (
    FeishuWebhookProviderConfig | DingTalkWebhookProviderConfig
  )[] = [];
  const feishuWebhookUrl = env.string('FEISHU_WEBHOOK_URL');
  if (feishuWebhookUrl) {
    providers.push(
      defineFeishuWebhookProviderConfig({
        name: 'feishu',
        webhookUrl: feishuWebhookUrl,
        secret: env.string('FEISHU_WEBHOOK_SECRET'),
      }),
    );
  }
  const dingTalkWebhookUrl = env.string('DINGTALK_WEBHOOK_URL');
  if (dingTalkWebhookUrl) {
    providers.push(
      defineDingTalkWebhookProviderConfig({
        name: 'dingtalk',
        webhookUrl: dingTalkWebhookUrl,
        secret: env.string('DINGTALK_WEBHOOK_SECRET'),
      }),
    );
  }
  return providers;
}

function required(env: ConfigEnv, key: string, provider: string): string {
  const value = env.string(key);
  if (value) return value;
  throw new Error(`${key} is required when Provider "${provider}" is enabled.`);
}

function hasAnyConfig(env: ConfigEnv, keys: readonly string[]): boolean {
  return keys.some((key) => env.string(key) !== undefined);
}
