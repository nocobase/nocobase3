# 配置 Channel

通知配置通常放在应用的 `server/config/notification.ts`。配置只包含可以序列化的数据；Channel 和 Provider 实例由 `NotificationManager.start()` 创建。

## 配置结构

```ts
import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';
import {
  defineEmailChannelConfig,
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
```

## 配置站内信

站内信使用 `in-app` Channel 和 database Provider：

```ts
defineInAppChannelConfig({
  enabled: env.boolean('NOTIFICATION_IN_APP_ENABLED', true),
  providers: [
    {
      type: 'database',
      name: 'primary',
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
} from '@nocobase/app-plugin-notification-providers';

defineEmailChannelConfig({
  enabled: env.boolean('NOTIFICATION_EMAIL_ENABLED', false),
  providers: [
    defineSmtpProviderConfig({
      name: 'primary-smtp',
      host: env.string('SMTP_HOST', '127.0.0.1'),
      port: env.number('SMTP_PORT', 587),
      secure: env.boolean('SMTP_SECURE', false),
      auth: {
        user: env.string('SMTP_USER', ''),
        pass: env.string('SMTP_PASSWORD', ''),
      },
      from: env.string('SMTP_FROM', 'notifications@example.com'),
    }),
  ],
});
```

`secure: true` 通常用于直接建立 TLS 的 SMTP 端口。具体端口和认证方式以邮件供应商提供的配置为准。

### `name` 是 Provider 实例的稳定标识

Provider 配置中的 `type` 和 `name` 用途不同：

- `type` 用于选择 Provider 实现，比如 `smtp`
- `name` 用于标识一个具体的 Provider 配置实例，比如 `primary-smtp`

```ts
defineSmtpProviderConfig({
  name: 'primary-smtp', // 该 SMTP 配置实例的稳定标识
  host: 'smtp.example.com',
  port: 587,
  from: 'notifications@example.com',
});
```

`name` 在同一个 Channel 内必须唯一。同一种 Provider 实现可以配置多次，只要使用不同的 `name`。

Notification Manager 在每次启动时都会根据配置重新创建 Provider Runtime。核心模块不会自动生成或单独持久化 `name`，因此重启后的身份一致性由配置文件保证。配置同一个 Provider 实例时，应始终使用同一个 `name`。

:::warning 注意

不要使用随机值、时间戳或 Provider 在数组中的位置生成 `name`。这会导致每次重启后都被视为不同的 Provider 实例，投递记录和 Attempt 日志也无法稳定关联到原配置。

轮换密码、API key 或证书时，如果仍然是同一个逻辑 Provider 实例，保持 `name` 不变。如果改为另一个供应商账号或投递目标，建议使用新的 `name`。

当还有 `pending`、`preparing` 或 `submitting` Delivery 时，不要重命名 Provider。已创建的 Delivery 会按快照中的 `name` 查找 Provider Runtime；如需下线旧实例，应先等待这些投递完成。

:::

## 配置多个 Provider

同一个 Channel 可以按顺序配置多个 Provider：

```ts
defineEmailChannelConfig({
  enabled: true,
  providers: [
    defineSmtpProviderConfig({
      name: 'primary-smtp',
      host: 'smtp-primary.example.com',
      port: 587,
      from: 'notifications@example.com',
    }),
    defineSmtpProviderConfig({
      name: 'backup-smtp',
      host: 'smtp-backup.example.com',
      port: 587,
      from: 'notifications@example.com',
    }),
  ],
});
```

Provider 的 `name` 在同一个 Channel 中必须唯一，并且需要在重启和配置发布之间保持稳定。当前 Provider 返回 `next_provider` 时，Manager 才会尝试快照中的下一个 Provider；返回 `same_provider` 时由核心持久化调度重试，且复用同一个 Delivery 幂等键；返回 `submission_unknown` 时不会重试或 fallback。

## 完整配置

```ts
const notificationConfig: ConfigFactory<AppNotificationConfig> = defineConfig(
  ({ env }): AppNotificationConfig => ({
    enabled: env.boolean('NOTIFICATION_ENABLED', false),
    channels: [
      defineInAppChannelConfig({
        enabled: env.boolean('NOTIFICATION_IN_APP_ENABLED', true),
        providers: [{ type: 'database', name: 'primary' }],
      }),
      defineEmailChannelConfig({
        enabled: env.boolean('NOTIFICATION_EMAIL_ENABLED', false),
        providers: [],
      }),
    ],
  }),
);

export default notificationConfig;
```

启用的 Channel 至少要配置一个启用的 Provider。否则 `start()` 会抛出错误。
