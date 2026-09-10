---
title: '手动接入通知'
description: '在 NocoBase 应用中手动接入 NotificationManager、站内信、Email 与 IM Provider、路由和生命周期。'
keywords: 'NocoBase,NotificationManager,通知接入,站内信,SMTP,Resend,飞书,钉钉'
---

# 手动接入通知

通知包通过插件的 `ServiceProvider` 接入 NocoBase Application。启用插件后，Provider 从共享容器解析数据库、队列和日志服务，创建 `NotificationManager`，并负责启动与关闭。默认模板同时注册内置 Email 与 IM Provider，通常只需要参考[配置通知 Provider](../../../app-plugin-notification-providers/docs/zh-CN/configuration.md)填写环境变量；自定义宿主仍可按本文后半部分手动组合这些能力。

这套方式会让宿主明确决定启用哪些通知能力。只需要邮件时，不必创建站内信 store 和 router。

## 第一步：安装包并注册 migrations

安装核心包和需要的 Channel / Provider 包：

```bash
pnpm add @nocobase/app-plugin-notification \
  @nocobase/app-plugin-notification-in-app \
  @nocobase/app-plugin-notification-providers
```

在应用的 `server/plugins.ts` 中注册这三个插件；不需要在 `package.json` 中维护额外的启用清单。

然后执行应用的 migration 命令：

```bash
pnpm migrate
```

默认模板在
`server/plugins.ts` 中显式组合各插件导出的 Server definition，由 definition 声明
migrations、Service Providers 和 Routes；测试页面拥有独立的登录和权限边界。
自定义宿主可继续按下面的步骤手动创建运行时和挂载路由。

## 第二步：创建配置

配置由宿主读取并传给 `NotificationManager`。下面同时启用站内信和 SMTP 邮件。Resend、飞书与钉钉的配置字段见[配置通知 Provider](../../../app-plugin-notification-providers/docs/zh-CN/configuration.md)：

```ts
import {
  defineEmailChannelConfig,
  defineSmtpProviderConfig,
} from '@nocobase/app-plugin-notification-providers';
import { defineInAppChannelConfig } from '@nocobase/app-plugin-notification-in-app';
import type { NotificationConfig } from '@nocobase/app-plugin-notification';

export const notificationConfig: NotificationConfig = {
  channels: [
    defineInAppChannelConfig({
      enabled: true,
      providers: [{ type: 'database', name: 'default' }],
    }),
    defineEmailChannelConfig({
      enabled: true,
      providers: [
        defineSmtpProviderConfig({
          name: 'primary-smtp',
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: {
            user: 'mailer@example.com',
            pass: 'replace-with-an-app-password',
          },
          from: 'NocoBase <mailer@example.com>',
        }),
      ],
    }),
  ],
};
```

Provider 的 `type` 是实现类型，用于匹配已注册的 Provider definition；`name` 是当前 Channel 内这条 Provider 配置的唯一名称，发送路由通过它选择 Provider。两者都会写入 Delivery，应用重启或更新配置后应保持稳定。Webhook Provider 不需要额外的 `target` 或业务收件人；发送时省略 `to` 即可把消息交给选中的 Provider。

## 第三步：创建运行时并注册 definitions

在宿主自己的模块中创建 manager。先注册所有 Channel 和 Provider definition，再调用 `start()`：

```ts
import type { DatabaseManager } from '@nocobase/db';
import {
  createNotificationManager,
  createNotificationRegistry,
  type NotificationManager,
  type NotificationProviderIdentity,
} from '@nocobase/app-plugin-notification';
import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
  createInAppStore,
  type InAppMessage,
  type InAppRecipient,
  type InAppStore,
} from '@nocobase/app-plugin-notification-in-app';
import {
  createEmailChannelDefinition,
  createResendProviderDefinition,
  createSmtpProviderDefinition,
  type EmailMessage,
  type EmailRecipient,
} from '@nocobase/app-plugin-notification-providers';
import {
  createDingTalkWebhookProviderDefinition,
  createFeishuWebhookProviderDefinition,
  createImChannelDefinition,
  type ImMessage,
  type ImRecipient,
} from '@nocobase/app-plugin-notification-providers/im';
import type { Logger } from '@nocobase/logging';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import { notificationConfig } from './notification-config.js';

interface AppNotificationChannels {
  readonly 'in-app': {
    readonly recipient: InAppRecipient;
    readonly message: InAppMessage;
  };
  readonly email: {
    readonly recipient: EmailRecipient;
    readonly message: EmailMessage;
  };
  readonly im: {
    readonly recipient: ImRecipient;
    readonly message: ImMessage;
  };
}

export interface AppNotificationRuntime {
  readonly manager: NotificationManager<AppNotificationChannels>;
  readonly inAppStore: InAppStore;
}

export function createAppNotificationRuntime(options: {
  readonly database: DatabaseManager;
  readonly queue: NocoBaseQueueManager;
  readonly logger: Logger;
  readonly resolveUserEmail?: (
    userId: string,
    provider: NotificationProviderIdentity,
  ) => Promise<string | undefined>;
}): AppNotificationRuntime {
  const registry = createNotificationRegistry();
  const inAppStore = createInAppStore(options.database);

  registry
    .registerChannel(createInAppChannelDefinition())
    .registerProvider(
      'in-app',
      createDatabaseProviderDefinition({ store: inAppStore }),
    )
    .registerChannel(
      createEmailChannelDefinition({
        resolveUserEmail: options.resolveUserEmail,
      }),
    )
    .registerProvider('email', createSmtpProviderDefinition())
    .registerProvider('email', createResendProviderDefinition())
    .registerChannel(createImChannelDefinition())
    .registerProvider('im', createFeishuWebhookProviderDefinition())
    .registerProvider('im', createDingTalkWebhookProviderDefinition());

  const manager = createNotificationManager<AppNotificationChannels>({
    database: options.database,
    queue: options.queue,
    logger: options.logger,
    config: notificationConfig,
    registry,
  });

  return { manager, inAppStore };
}
```

如果不需要站内信，可以删除 `inAppStore`、`in-app` Channel 和 database Provider。Email 与 IM definitions 也可以按需移除。只注册 definitions 不会发送消息；只有配置中启用相应 Provider，并调用 `send()` 后才会发生外部请求。

### 自定义 Provider 的幂等契约

自定义 Provider 可以通过 `capabilities.idempotency` 声明重复提交是否安全。省略该配置或设置为 `{ supported: false }` 时，通知服务会认为 Provider 不支持幂等。

只有当相同 `deliveryId` 的重复提交不会产生重复消息时，才能设置 `{ supported: true }`。通知服务会在同一条 Delivery 的每次重试中复用 `deliveryId`，但不会替 Provider 实现查重。Provider 需要把它作为外部服务的幂等键，或者在自己的存储中建立唯一约束：

```ts
return {
  name: config.name,
  type: config.type,
  capabilities: {
    idempotency: { supported: true },
  },
  async send(input) {
    await client.send({
      message: input.message,
      idempotencyKey: input.deliveryId,
    });
    return { status: 'accepted' };
  },
};
```

如果外部服务只在固定时间内保留幂等键，还需要按它承诺的有效期设置 `retentionMs`：

```ts
capabilities: {
  idempotency: {
    supported: true,
    retentionMs: 24 * 60 * 60 * 1000,
  },
},
```

`retentionMs` 省略时，表示 Provider 能在该 Delivery 的整个生命周期内保证幂等。不要使用 `attemptId` 作为幂等键——每次实际提交都会创建新的 Attempt，因此重试时它会变化。

:::warning 注意

`supported: true` 只是能力声明，不会触发任何自动查重逻辑。如果 Provider 没有基于 `deliveryId` 实现幂等，通知服务会把存在重复风险的 `unknown` 重试错误地判断为安全重试。

:::

## 第四步：挂载路由

`manager.router` 提供 Delivery 和 Attempt 日志。站内信的收件箱 router 由 `@nocobase/app-plugin-notification-in-app` 提供，需要使用第三步创建的同一个 store：

```ts
import { createInAppRouter } from '@nocobase/app-plugin-notification-in-app';
import { Hono, type MiddlewareHandler } from 'hono';

import type { AppNotificationRuntime } from './notification-runtime.js';

export function createNotificationRoutes(options: {
  readonly authRequired: MiddlewareHandler;
  readonly notification: AppNotificationRuntime;
  readonly resolveRequestUserId: (
    request: Request,
  ) => Promise<string | undefined>;
}): Hono {
  const routes = new Hono();
  routes.use('*', options.authRequired);
  routes.route('/', options.notification.manager.router);
  routes.route(
    '/in-app',
    createInAppRouter(options.notification.inAppStore, {
      resolveUserId: options.resolveRequestUserId,
    }),
  );

  return routes;
}

app.route(
  '/api/notifications',
  createNotificationRoutes({
    authRequired,
    notification,
    resolveRequestUserId,
  }),
);
```

`resolveRequestUserId` 必须从当前请求中得到登录用户 ID。不要接受客户端直接提交的用户 ID 作为当前用户身份。
通知日志和站内信 router 会从请求上下文取得 translator，以返回包含
`code/message/ns/key/params` 的结构化错误。自定义宿主需要把公开的 locale loaders
注册到自己的 `I18nRuntime`，再在这些 router 之前挂载请求 i18n middleware：

```ts
import {
  NOTIFICATION_NAMESPACE,
  notificationServerLocales,
} from '@nocobase/app-plugin-notification';
import {
  IN_APP_NOTIFICATION_NAMESPACE,
  inAppNotificationServerLocales,
} from '@nocobase/app-plugin-notification-in-app';
import { createI18nMiddleware } from '@nocobase/i18n/server';

i18n.registerNamespace(NOTIFICATION_NAMESPACE, notificationServerLocales);
i18n.registerNamespace(
  IN_APP_NOTIFICATION_NAMESPACE,
  inAppNotificationServerLocales,
);
await i18n.init();
app.use('*', createI18nMiddleware(i18n));
```

这里的 `i18n` 是宿主拥有的 `I18nRuntime`。认证 middleware 自己产生的错误仍遵循认证插件的契约。

## 第五步：接入生命周期

所有 definitions 和 routes 注册完成后启动 manager，并在应用关闭时释放资源：

```ts
await notification.manager.start();

lifecycle.registerDisposer('notification', async (): Promise<void> => {
  await notification.manager.close();
});
```

这里的 `lifecycle` 表示宿主自己的生命周期管理器。`start()` 会创建已启用 Channel 的运行时、注册队列任务并启动 reconciler。`close()` 会停止 reconciler，并按逆序关闭 Provider。

## 可选：接入客户端页面

Delivery 日志仍由 `@nocobase/app-plugin-notification` 的 `logs-ui` Registry
item 提供。它会把可编辑源码物化到应用：

```bash
pnpm registry materialize \
  --package @nocobase/app-plugin-notification \
  --item logs-ui \
  --output-root /path/to/your-app

```

该 item 会写入 `client/extensions/nocobase-notification-logs-ui`。

个人站内信组件示例由 `@nocobase/app-plugin-notification-in-app/client`
直接提供。把该 Client 插件注册到应用后，开发环境会自动出现
`/dev/notification-in-app`；当应用 public base 为 `/main` 时，浏览器路径是
`/main/dev/notification-in-app`。页面自身挂载未读数 Provider，离开页面后会清理
实时订阅。Dev Route 及页面模块不会进入生产构建。

两个页面分别请求 `/api/notifications/logs` 和
`/api/notifications/in-app`，需要和第四步的服务端挂载路径保持一致。日志
Registry 副本属于消费应用；站内信 Dev 页面属于插件 runtime，随插件升级。

## 相关链接

- [通知概览](./overview.md)——了解 Notification、Delivery 和 Attempt
- [配置通知 Provider](../../../app-plugin-notification-providers/docs/zh-CN/configuration.md)——配置 SMTP、Resend、飞书和钉钉
- [发送通知](./sending.md)——使用 `NotificationManager.send()`
- [通知日志](./logs.md)——查询 Delivery 和 Attempt
