import {
  defineConfig,
  type ConfigEnv,
  type ConfigFactory,
} from '@nocobase/app-server-kit/config';
import type { NotificationConfig } from '@nocobase/app-plugin-notification';
import {
  defineEmailChannelConfig,
  defineResendProviderConfig,
  defineSmtpProviderConfig,
  type EmailChannelConfig,
  type ResendProviderConfig,
  type SmtpProviderConfig,
} from '@nocobase/app-plugin-notification-providers';
import {
  defineDingTalkWebhookProviderConfig,
  defineFeishuWebhookProviderConfig,
  type DingTalkWebhookProviderConfig,
  type FeishuWebhookProviderConfig,
  type ImChannelConfig,
} from '@nocobase/app-plugin-notification-providers/im';

export type AppNotificationChannelConfig =
  EmailChannelConfig | AppImChannelConfig;

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
  const emailProvider = createEmailProvider(env);
  const imProviders = createImProviders(env);

  if (emailProvider) {
    channels.push(
      defineEmailChannelConfig({ enabled: true, providers: [emailProvider] }),
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

function createEmailProvider(
  env: ConfigEnv,
): SmtpProviderConfig | ResendProviderConfig | undefined {
  const selected = env.string('NOTIFICATION_EMAIL_PROVIDER')?.toLowerCase();
  if (!selected) return undefined;

  if (selected === 'smtp') {
    const host = required(env, 'SMTP_HOST', selected);
    const from = required(env, 'SMTP_FROM', selected);
    const user = env.string('SMTP_USER');
    const password = env.string('SMTP_PASSWORD');
    if (Boolean(user) !== Boolean(password)) {
      throw new Error(
        'SMTP_USER and SMTP_PASSWORD must either both be configured or both be omitted.',
      );
    }
    const port = env.number('SMTP_PORT', 587);

    return defineSmtpProviderConfig({
      name: 'smtp',
      host,
      port,
      secure: env.boolean('SMTP_SECURE', port === 465),
      auth: user && password ? { user, pass: password } : undefined,
      from,
      replyTo: env.string('SMTP_REPLY_TO'),
    });
  }

  if (selected === 'resend') {
    return defineResendProviderConfig({
      name: 'resend',
      apiKey: required(env, 'RESEND_API_KEY', selected),
      from: required(env, 'RESEND_FROM', selected),
      replyTo: env.string('RESEND_REPLY_TO'),
    });
  }

  throw new Error(
    'NOTIFICATION_EMAIL_PROVIDER must be either "smtp" or "resend".',
  );
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
