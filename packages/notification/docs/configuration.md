# 配置 Channel

通知配置通常放在应用的 `server/config/notification.ts`。配置只包含可以序列化的数据；Channel 和 Provider 实例由 `NotificationManager.start()` 创建。

## 配置结构

```ts
import { defineConfig, type ConfigFactory } from "@nocobase/app-server/config";
import {
  defineEmailChannelConfig,
  type EmailChannelConfig,
} from "@nocobase/notification-email";
import {
  defineInAppChannelConfig,
  type InAppChannelConfig,
} from "@nocobase/notification-in-app";

export interface AppNotificationConfig {
  readonly enabled: boolean;
  readonly allowNonPersistentStore: boolean;
  readonly channels: readonly [InAppChannelConfig, EmailChannelConfig];
  readonly logs: {
    readonly enabled: boolean;
    readonly retainDays: number;
  };
}
```

## 配置站内信

站内信使用 `in-app` Channel 和 database Provider：

```ts
defineInAppChannelConfig({
  enabled: env.boolean("NOTIFICATION_IN_APP_ENABLED", true),
  providers: [
    {
      type: "database",
      name: "primary",
    },
  ],
});
```

`defineInAppChannelConfig()` 只生成配置，不会访问数据库。

## 配置 SMTP 邮件

```ts
import {
  defineEmailChannelConfig,
  defineSmtpProviderConfig,
} from "@nocobase/notification-email";

defineEmailChannelConfig({
  enabled: env.boolean("NOTIFICATION_EMAIL_ENABLED", false),
  providers: [
    defineSmtpProviderConfig({
      name: "primary-smtp",
      host: env.string("SMTP_HOST", "127.0.0.1"),
      port: env.number("SMTP_PORT", 587),
      secure: env.boolean("SMTP_SECURE", false),
      auth: {
        user: env.string("SMTP_USER", ""),
        pass: env.string("SMTP_PASSWORD", ""),
      },
      from: env.string("SMTP_FROM", "notifications@example.com"),
    }),
  ],
});
```

`secure: true` 通常用于直接建立 TLS 的 SMTP 端口。具体端口和认证方式以邮件供应商提供的配置为准。

## 配置多个 Provider

同一个 Channel 可以按顺序配置多个 Provider：

```ts
defineEmailChannelConfig({
  enabled: true,
  providers: [
    defineSmtpProviderConfig({
      name: "primary-smtp",
      host: "smtp-primary.example.com",
      port: 587,
      from: "notifications@example.com",
    }),
    defineSmtpProviderConfig({
      name: "backup-smtp",
      host: "smtp-backup.example.com",
      port: 587,
      from: "notifications@example.com",
    }),
  ],
});
```

Provider 的 `name` 在同一个 Channel 中必须唯一。当前 Provider 明确返回可继续的失败结果时，Manager 才会尝试下一个 Provider；不会重复调用同一个 Provider。

## 完整配置

```ts
const notificationConfig: ConfigFactory<AppNotificationConfig> = defineConfig(
  ({ env }): AppNotificationConfig => ({
    enabled: env.boolean("NOTIFICATION_ENABLED", false),
    allowNonPersistentStore: env.boolean(
      "NOTIFICATION_ALLOW_NON_PERSISTENT_STORE",
      false,
    ),
    channels: [
      defineInAppChannelConfig({
        enabled: env.boolean("NOTIFICATION_IN_APP_ENABLED", true),
        providers: [{ type: "database", name: "primary" }],
      }),
      defineEmailChannelConfig({
        enabled: env.boolean("NOTIFICATION_EMAIL_ENABLED", false),
        providers: [],
      }),
    ],
    logs: {
      enabled: true,
      retainDays: 90,
    },
  }),
);

export default notificationConfig;
```

:::warning 注意

当前版本保留了 `logs.enabled` 和 `logs.retainDays` 配置字段，不过还没有根据它们关闭日志或自动清理历史记录。

:::

启用的 Channel 至少要配置一个启用的 Provider。否则 `start()` 会抛出错误。
