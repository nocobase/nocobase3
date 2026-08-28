---
title: '手动接入通知'
description: '在 NocoBase 应用中手动接入 NotificationManager、站内信 Channel、SMTP Provider、路由和生命周期。'
keywords: 'NocoBase,NotificationManager,通知接入,站内信,SMTP'
---

# 手动接入通知

通知包不会修改应用宿主，也不会在安装后自动创建 `NotificationManager`。你需要在自己的应用代码中完成 migrations、配置、Channel 与 Provider 注册、路由挂载和生命周期管理。

这套方式会让宿主明确决定启用哪些通知能力。只需要邮件时，不必创建站内信 store 和 router。

## 第一步：安装包并注册 migrations

安装核心包和需要的 Channel / Provider 包：

```bash
pnpm add @nocobase/app-plugin-notification \
  @nocobase/app-plugin-notification-in-app \
  @nocobase/app-plugin-notification-providers
```

如果应用使用 `nocobase.plugins` 发现 migrations，在应用的 `package.json` 中加入：

```json
{
  "nocobase": {
    "plugins": {
      "@nocobase/app-plugin-notification": {
        "enabled": true
      },
      "@nocobase/app-plugin-notification-in-app": {
        "enabled": true
      }
    }
  }
}
```

然后执行应用的 migration 命令：

```bash
pnpm migrate
```

这里的插件声明只用于发现 notification 和 in-app migrations，不会自动创建运行时。

## 第二步：创建配置

配置由宿主读取并传给 `NotificationManager`。下面同时启用站内信和 SMTP 邮件：

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
      providers: [{ type: 'database', name: 'in-app' }],
    }),
    defineEmailChannelConfig({
      enabled: true,
      providers: [
        defineSmtpProviderConfig({
          name: 'primary-smtp',
          host: process.env.SMTP_HOST ?? '127.0.0.1',
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD ?? '',
              }
            : undefined,
          from: process.env.SMTP_FROM ?? 'notifications@example.com',
        }),
      ],
    }),
  ],
};
```

Provider 的 `name` 和 `type` 会写入 Delivery。应用重启或更新配置后，应保持这两个字段稳定。

## 第三步：创建运行时并注册 definitions

在宿主自己的模块中创建 manager。先注册所有 Channel 和 Provider definition，再调用 `start()`：

```ts
import type { DatabaseManager } from '@nocobase/app-database';
import {
  createNotificationManager,
  createNotificationRegistry,
  type NotificationManager,
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
  createSmtpProviderDefinition,
  type EmailMessage,
  type EmailRecipient,
} from '@nocobase/app-plugin-notification-providers';
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
}

export interface AppNotificationRuntime {
  readonly manager: NotificationManager<AppNotificationChannels>;
  readonly inAppStore: InAppStore;
}

export function createAppNotificationRuntime(options: {
  readonly database: DatabaseManager;
  readonly queue: NocoBaseQueueManager;
  readonly logger: Logger;
  readonly resolveUserEmail?: (userId: string) => Promise<string | undefined>;
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
    .registerProvider('email', createSmtpProviderDefinition());

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

如果不需要站内信，可以删除 `inAppStore`、`in-app` Channel 和 database Provider。邮件也可以用同样方式按需移除。

## 第四步：挂载路由

`manager.router` 提供 Delivery 和 Attempt 日志。站内信的收件箱 router 由 `@nocobase/app-plugin-notification-in-app` 提供，需要使用第三步创建的同一个 store：

```ts
import { createInAppRouter } from '@nocobase/app-plugin-notification-in-app';
import { Hono, type MiddlewareHandler } from 'hono';

import type { AppNotificationRuntime } from './notification-runtime.js';

export function registerNotificationRoutes(options: {
  readonly app: Hono;
  readonly authRequired: MiddlewareHandler;
  readonly notification: AppNotificationRuntime;
  readonly resolveRequestUserId: (
    request: Request,
  ) => Promise<string | undefined>;
}): void {
  const routes = new Hono();
  routes.use('*', options.authRequired);
  routes.route('/', options.notification.manager.router);
  routes.route(
    '/in-app',
    createInAppRouter(options.notification.inAppStore, {
      resolveUserId: options.resolveRequestUserId,
    }),
  );

  options.app.route('/api/notifications', routes);
}
```

`resolveRequestUserId` 必须从当前请求中得到登录用户 ID。不要接受客户端直接提交的用户 ID 作为当前用户身份。

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

Delivery 日志和个人站内信页面分别由对应插件发布为 Registry 配方：

- `@nocobase/app-plugin-notification` 的 `logs-ui` item 提供 Delivery 和 Attempt 日志页面；
- `@nocobase/app-plugin-notification-in-app` 的 `in-app-ui` item 提供个人站内信页面、未读数 Provider 和客户端 API 适配器。

canonical source 位于插件自身的 `registry/` 目录，默认模板不再保存副本。

在仓库中可以把它物化到应用：

```bash
pnpm registry materialize \
  --package @nocobase/app-plugin-notification \
  --item logs-ui \
  --output-root /path/to/your-app

pnpm registry materialize \
  --package @nocobase/app-plugin-notification-in-app \
  --item in-app-ui \
  --output-root /path/to/your-app
```

两个 item 会分别写入 `client/extensions/nocobase-notification-logs-ui` 和 `client/extensions/nocobase-notification-in-app-ui`。

当前插件尚未提供稳定的客户端路由和 Provider contribution contract，因此这两个 item 不包含 `extension.ts`，安装后不会自动注册页面。应用需要主动接入 `NotificationLogsPage`，并用 `NotificationInAppProvider` 包裹需要站内信状态的子树后接入 `NotificationInAppPage`。等插件补齐默认客户端路由和稳定 route ID 后，再由 Registry 通过 source extension 覆盖默认页面。

页面默认请求 `/api/notifications/logs` 和 `/api/notifications/in-app`，需要和第四步的服务端挂载路径保持一致。物化后的代码属于消费应用，可以按需修改；registry 扩展不会创建服务端 runtime。

## 相关链接

- [通知概览](./overview.md)——了解 Notification、Delivery 和 Attempt
- [配置通知](./configuration.md)——调整 Channel 和 Provider 配置
- [发送通知](./sending.md)——使用 `NotificationManager.send()`
- [通知日志](./logs.md)——查询 Delivery 和 Attempt
