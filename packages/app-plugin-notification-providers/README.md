# Notification Providers App Plugin

`@nocobase/app-plugin-notification-providers` provides built-in notification Channels and Providers for explicit application integration.

Implementations are grouped by Channel under `server/`. The first-batch catalog contains Email (SMTP/Resend) and IM webhooks (Feishu/DingTalk):

```text
server/
├── email/
├── im/
└── http.ts
```

Import the definitions from your application runtime and register them before creating or starting a `NotificationManager`:

```ts
import {
  createEmailChannelDefinition,
  createResendProviderDefinition,
  createSmtpProviderDefinition,
} from '@nocobase/app-plugin-notification-providers';

notificationRegistry
  .registerChannel(createEmailChannelDefinition())
  .registerProvider('email', createSmtpProviderDefinition())
  .registerProvider('email', createResendProviderDefinition());
```

Register the IM definitions from `@nocobase/app-plugin-notification-providers/im` in the same way. Configure Providers with the matching `define*ProviderConfig()` helper and pass the resulting Channel configuration to the manager. The package does not modify the host application's bootstrap or routes.

SMTP and Resend use their official Node.js libraries. Feishu and DingTalk use signed outbound robot webhooks.

IM Webhook Providers require HTTPS, reject redirects, and enforce explicit vendor hostname allowlists. Secrets must be supplied through the host application's secret configuration and never logged.
