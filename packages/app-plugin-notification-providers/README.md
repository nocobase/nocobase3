# Notification Providers App Plugin

`@nocobase/app-plugin-notification-providers` provides built-in Email and IM
notification definitions and an authenticated test page.

| Channel | Provider type      | Configuration helper                    | Definition factory                          |
| ------- | ------------------ | --------------------------------------- | ------------------------------------------- |
| Email   | `smtp`             | `defineSmtpProviderConfig()`            | `createSmtpProviderDefinition()`            |
| Email   | `resend`           | `defineResendProviderConfig()`          | `createResendProviderDefinition()`          |
| IM      | `feishu-webhook`   | `defineFeishuWebhookProviderConfig()`   | `createFeishuWebhookProviderDefinition()`   |
| IM      | `dingtalk-webhook` | `defineDingTalkWebhookProviderConfig()` | `createDingTalkWebhookProviderDefinition()` |

The package does not read environment variables. The host owns secret loading,
configuration, and the notification runtime lifecycle. Hosts that use the
NocoBase plugin conventions load the package's `server/bootstrap.ts`, which
registers all built-in definitions automatically. Other hosts can register the
definitions explicitly as shown below.

## Test configured Providers

The plugin exposes `/api/notification-providers/test`. The route requires an
authenticated user and is available only when `notification.test.enabled` is
`true`. It sends through the regular Notification Manager, so each test creates
Notification, Delivery, and Attempt records.

Email tests use `notification.test.emailRecipient`; the page never accepts an
arbitrary recipient. IM tests send to the group owned by the selected Provider
Webhook. The default application template maps these settings from
`NOTIFICATION_PROVIDER_TEST_ENABLED` and `TEST_EMAIL_RECIPIENT`, enables the
page outside production, and disables it by default in production.

## Register definitions

Register every definition that can appear in the application configuration
before the notification manager is activated or started:

```ts
import {
  createEmailChannelDefinition,
  createResendProviderDefinition,
  createSmtpProviderDefinition,
} from '@nocobase/app-plugin-notification-providers';
import {
  createDingTalkWebhookProviderDefinition,
  createFeishuWebhookProviderDefinition,
  createImChannelDefinition,
} from '@nocobase/app-plugin-notification-providers/im';

notificationRegistry
  .registerChannel(createEmailChannelDefinition())
  .registerProvider('email', createSmtpProviderDefinition())
  .registerProvider('email', createResendProviderDefinition())
  .registerChannel(createImChannelDefinition())
  .registerProvider('im', createFeishuWebhookProviderDefinition())
  .registerProvider('im', createDingTalkWebhookProviderDefinition());
```

## Configure SMTP

```ts
import {
  defineEmailChannelConfig,
  defineSmtpProviderConfig,
} from '@nocobase/app-plugin-notification-providers';

const email = defineEmailChannelConfig({
  enabled: true,
  providers: [
    defineSmtpProviderConfig({
      name: 'smtp',
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: {
        user: 'mailer@example.com',
        pass: secretStore.smtpPassword,
      },
      from: 'NocoBase <mailer@example.com>',
      replyTo: 'support@example.com',
    }),
  ],
});
```

Use `secure: true` for servers that establish TLS immediately, commonly on
port `465`. Port `587` commonly uses `secure: false` and upgrades the connection
with STARTTLS. Follow the mail provider's requirements.

Gmail uses `smtp.gmail.com` and requires an app password when the account uses
two-step verification. Do not use the normal account password.

## Configure Resend

```ts
import {
  defineEmailChannelConfig,
  defineResendProviderConfig,
} from '@nocobase/app-plugin-notification-providers';

const email = defineEmailChannelConfig({
  enabled: true,
  providers: [
    defineResendProviderConfig({
      name: 'resend',
      apiKey: secretStore.resendApiKey,
      from: 'NocoBase <notifications@example.com>',
      replyTo: 'support@example.com',
    }),
  ],
});
```

Create the API key in the Resend dashboard. Production senders should use an
address on a verified domain.

## Configure Feishu

Create a custom bot in the target group, copy its Webhook URL, and enable
signature verification when possible:

```ts
import {
  defineFeishuWebhookProviderConfig,
  defineImChannelConfig,
} from '@nocobase/app-plugin-notification-providers/im';

const im = defineImChannelConfig({
  enabled: true,
  providers: [
    defineFeishuWebhookProviderConfig({
      name: 'feishu',
      webhookUrl:
        'https://open.feishu.cn/open-apis/bot/v2/hook/replace-this-value',
      secret: secretStore.feishuWebhookSecret,
    }),
  ],
});
```

The Provider accepts HTTPS Webhooks on `open.feishu.cn` and
`open.larksuite.com`. Redirects are rejected.

## Configure DingTalk

Create a custom robot in the target group, select the additional-signature
security option, and copy both the Webhook and the `SEC...` secret:

```ts
import {
  defineDingTalkWebhookProviderConfig,
  defineImChannelConfig,
} from '@nocobase/app-plugin-notification-providers/im';

const im = defineImChannelConfig({
  enabled: true,
  providers: [
    defineDingTalkWebhookProviderConfig({
      name: 'dingtalk',
      webhookUrl:
        'https://oapi.dingtalk.com/robot/send?access_token=replace-this-value',
      secret: secretStore.dingTalkWebhookSecret,
    }),
  ],
});
```

The Provider accepts HTTPS Webhooks on `oapi.dingtalk.com`. Redirects are
rejected.

## Send messages

Email accepts a direct email recipient:

```ts
await notification.send({
  to: { type: 'email', address: 'alice@example.com' },
  channels: ['email'],
  content: { title: 'Approval complete', body: 'Review the result.' },
});
```

IM accepts an explicit Provider recipient:

```ts
await notification.send({
  to: {
    type: 'provider',
    provider: { name: 'feishu', type: 'feishu-webhook' },
  },
  channels: ['im'],
  content: { title: 'Deployment complete', body: 'Production is ready.' },
});
```

Keep Provider names and types stable while deliveries are pending. Webhook URLs,
signing secrets, SMTP passwords, and API keys are credentials and must never be
committed or logged.
