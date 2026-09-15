---
title: 'Configure notification Providers'
description: 'Configure NocoBase SMTP, Resend, Feishu, and DingTalk notification Providers and verify their connection parameters.'
keywords: 'NocoBase,notification configuration,SMTP,Resend,Feishu,DingTalk,Webhook,Provider'
---

# Configure notification Providers

In NocoBase, `@nocobase/app-plugin-notification-providers` does not read environment variables directly. The application declares Channels and Providers through `notification.channels` in `config.yml`, and `NotificationManager` creates the corresponding runtime instances. The default template's `config.example.yml` enables in-app messages and includes commented examples for SMTP, Resend, Feishu, and DingTalk.

## Minimal configuration for the default template

Copy the example configuration, then uncomment the Channels and Providers you need:

```bash
cp packages/templates/app-template-default/config.example.yml \
  packages/templates/app-template-default/config.yml
```

SMTP, Resend, Feishu, and DingTalk can be enabled independently. SMTP and Resend can also be placed in the same Email Channel. An external Provider that is not listed in `notification.channels` is not enabled.

## Configure SMTP

SMTP works with Gmail, corporate email accounts, and self-hosted mail servers:

```yaml
notification:
  channels:
    - type: email
      enabled: true
      providers:
        - type: smtp
          name: smtp
          host: smtp.example.com
          port: 587
          secure: false
          auth:
            user: mailer@example.com
            pass: replace-with-an-app-password
          from: NocoBase <mailer@example.com>
          replyTo: reply@example.com
```

The fields are:

| Field     | Required | Description                                                                                                           |
| --------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `host`    | Yes      | SMTP server hostname.                                                                                                 |
| `port`    | Yes      | Port `465` is commonly used with `secure: true`; port `587` commonly upgrades the connection to TLS after connecting. |
| `secure`  | No       | Whether to use TLS immediately when establishing the connection.                                                      |
| `auth`    | No       | SMTP username and password. `user` and `pass` should be provided together.                                            |
| `from`    | No       | Default sender. It must follow the email provider's sender rules.                                                     |
| `replyTo` | No       | Reply address.                                                                                                        |

### Gmail

Gmail supports SMTP. You can usually use the following configuration:

```yaml
host: smtp.gmail.com
port: 465
secure: true
auth:
  user: your-account@gmail.com
  pass: your-16-character-app-password
from: your-account@gmail.com
```

`auth.pass` is not the password used to sign in to your Google account. Enable two-step verification first, then create an app password under the Google Account **Security** → **App passwords** page. Google shows the generated password only once, so you must revoke it and create a new one if you lose it. Some organization accounts disable app passwords through an administrator policy.

## Configure Resend

Create an API key in the Resend dashboard first. Production environments also need a verified sender domain, and `from` should use an address from that domain:

```yaml
notification:
  channels:
    - type: email
      enabled: true
      providers:
        - type: resend
          name: resend
          apiKey: re_xxxxxxxxx
          from: NocoBase <notifications@example.com>
          replyTo: reply@example.com
```

| Field     | Required | Description                                                                                              |
| --------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `apiKey`  | Yes      | API key created in the Resend dashboard.                                                                 |
| `from`    | Yes      | Sender on a verified domain. During testing, you can use the test address shown in the Resend dashboard. |
| `replyTo` | No       | Reply address.                                                                                           |

## Configure a Feishu group bot

In the target Feishu group, open **Settings** → **Group bots** → **Add bot** → **Custom bot**. After creating the bot, copy its Webhook URL. If **Signature verification** is enabled, also copy the signing secret:

```yaml
notification:
  channels:
    - type: im
      enabled: true
      providers:
        - type: feishu-webhook
          name: feishu
          webhookUrl: https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx
          secret: xxxxxxxx
```

Only fill in `secret` when signature verification is enabled for the bot. The Provider accepts HTTPS Webhooks only on `open.feishu.cn` and `open.larksuite.com`, and rejects redirects.

## Configure a DingTalk group bot

In the target DingTalk group, open **Group settings** → **Bots** → **Add bot** → **Custom**. Select the **Additional signature** security option, then copy the Webhook URL and the secret beginning with `SEC`:

```yaml
notification:
  channels:
    - type: im
      enabled: true
      providers:
        - type: dingtalk-webhook
          name: dingtalk
          webhookUrl: https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxx
          secret: SECxxxxxxxx
```

If the bot does not use **Additional signature**, you can omit `secret`. The Provider accepts HTTPS Webhooks only on `oapi.dingtalk.com`, and rejects redirects.

:::warning Note

The Webhook URL itself contains access credentials. Do not commit a `config.yml` that contains real credentials, and do not write Webhook URLs, signing secrets, SMTP passwords, or Resend API keys to logs. The template ignores `config.yml` by default.

:::

## Send a test message

The core notification plugin's log settings page dynamically displays the test action and form through the protected targets API. The target list contains only the intersection of registered definitions and enabled configuration instances; it never returns Webhook URLs, API keys, passwords, or signing secrets.

Email tests require a recipient address. IM tests are sent directly to the Webhook selected for the Provider. The page requires a logged-in user with the `notification:test` `send` permission, and you must explicitly enable testing in `config.yml`:

```yaml
notification:
  test:
    enabled: true
```

The core endpoints are `GET /api/notifications/test/targets`, `POST /api/notifications/test/send`, and `GET /api/notifications/test/:id/status`. All of them require the `x-nocobase-notification-test: 1` anti-CSRF header; only the user who started a test can view its status. Every test follows the normal `NotificationManager.send()` path and creates Notification, Delivery, and Attempt logs. Enable this only temporarily in a controlled environment, and disable it promptly after production verification.

## Build the configuration manually

Without the default template, you can use configuration helpers to build the same Channel configuration:

```ts
import {
  defineEmailChannelConfig,
  defineResendProviderConfig,
  defineSmtpProviderConfig,
} from '@nocobase/app-plugin-notification-providers';
import {
  defineDingTalkWebhookProviderConfig,
  defineFeishuWebhookProviderConfig,
  defineImChannelConfig,
} from '@nocobase/app-plugin-notification-providers/im';
import type { NotificationConfig } from '@nocobase/app-plugin-notification';

export const notificationConfig: NotificationConfig = {
  channels: [
    defineEmailChannelConfig({
      enabled: true,
      providers: [
        defineSmtpProviderConfig({
          name: 'smtp',
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: { user: 'mailer@example.com', pass: 'app-password' },
          from: 'NocoBase <mailer@example.com>',
        }),
        defineResendProviderConfig({
          name: 'resend',
          apiKey: 're_xxxxxxxxx',
          from: 'NocoBase <notifications@example.com>',
        }),
      ],
    }),
    defineImChannelConfig({
      enabled: true,
      providers: [
        defineFeishuWebhookProviderConfig({
          name: 'feishu',
          webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx',
          secret: 'xxxxxxxx',
        }),
        defineDingTalkWebhookProviderConfig({
          name: 'dingtalk',
          webhookUrl:
            'https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxx',
          secret: 'SECxxxxxxxx',
        }),
      ],
    }),
  ],
};
```

Each Webhook Provider directly represents an external group bot, so sending an IM message does not need `to`. Provider `name` values must be unique within a Channel; send through this name without passing `type`, or use `strategy: 'all'` to send to multiple Providers at once. Both the Provider `name` and `type` are stored in the Delivery, so they should remain stable after configuration deployment and application restarts. For complete routing syntax, see [Send notifications](../../../app-plugin-notification/docs/en-US/sending.md); for definition registration and lifecycle integration, see [Manually integrate notifications](../../../app-plugin-notification/docs/en-US/integration.md).

## Related links

- [Notification overview](../../../app-plugin-notification/docs/en-US/overview.md) — understand Notification, Delivery, and Attempt
- [Manually integrate notifications](../../../app-plugin-notification/docs/en-US/integration.md) — register Channel and Provider definitions
- [Send notifications](../../../app-plugin-notification/docs/en-US/sending.md) — send Email and IM messages from server-side business code
- [Notification logs](../../../app-plugin-notification/docs/en-US/logs.md) — query Delivery and Attempt records
- [Google app passwords](https://support.google.com/accounts/answer/185833) — create and manage an app password for Gmail SMTP
- [Resend Domains](https://resend.com/docs/dashboard/domains/introduction) — configure a sender domain
