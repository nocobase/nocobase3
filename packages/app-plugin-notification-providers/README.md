# Notification Providers App Plugin

`@nocobase/app-plugin-notification-providers` registers built-in notification Channels and Providers during application bootstrap.

Implementations are grouped by Channel under `server/`. The initial catalog contains the Email Channel and SMTP Provider:

```text
server/
├── bootstrap.ts
└── email/
    ├── channel.ts
    ├── types.ts
    └── providers/
        └── smtp.ts
```

Enable the package in the application's `nocobase.plugins` registry. Applications configure Channels and Providers with serializable config; they do not register the built-in definitions manually.
