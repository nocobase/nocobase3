# Notification Providers App Plugin

`@nocobase/app-plugin-notification-providers` provides built-in notification Channels and Providers for explicit application integration.

Implementations are grouped by Channel under `server/`. The initial catalog contains the Email Channel and SMTP Provider:

```text
server/
└── email/
    ├── channel.ts
    ├── types.ts
    └── providers/
        └── smtp.ts
```

Import the definitions from your application runtime and register them before creating or starting a `NotificationManager`:

```ts
import {
  createEmailChannelDefinition,
  createSmtpProviderDefinition,
} from '@nocobase/app-plugin-notification-providers';

notificationRegistry
  .registerChannel(createEmailChannelDefinition())
  .registerProvider('email', createSmtpProviderDefinition());
```

Configure the SMTP Provider with `defineSmtpProviderConfig()` and pass the resulting Channel configuration to the manager. The package does not modify the host application's bootstrap or routes.
