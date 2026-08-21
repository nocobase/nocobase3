# 接入应用

在 NocoBase 服务端应用中，**`NotificationManager`** 是通知服务的公共入口。应用负责提供数据库、队列、logger 和通知配置；业务模块不需要在每次发送时重复传入这些依赖。

## 第一步：定义应用支持的 Channel

Channel map 用于约束 `send()` 的收件人和消息类型：

```ts
import type {
  EmailMessage,
  EmailRecipient,
} from "@nocobase/notification-email";
import type {
  InAppMessage,
  InAppRecipient,
} from "@nocobase/notification-in-app";

export interface AppNotificationChannels {
  readonly "in-app": {
    readonly recipient: InAppRecipient;
    readonly message: InAppMessage;
  };
  readonly email: {
    readonly recipient: EmailRecipient;
    readonly message: EmailMessage;
  };
}
```

TypeScript 会根据 `channel` 检查对应的 `recipient` 和 `message`。

## 第二步：创建并注册 Channel

在应用服务初始化时创建 Manager：

```ts
import { createNotificationManager } from "@nocobase/notification";
import { createEmailChannelDefinition } from "@nocobase/notification-email";
import { createInAppChannelDefinition } from "@nocobase/notification-in-app";

const notification = createNotificationManager<AppNotificationChannels>({
  database: runtime.database,
  queue: deps.queueManager,
  logger: deps.logging.getLogger().child({ module: "notification" }),
  config: runtime.config.notification,
  allowNonPersistentStore: runtime.config.notification.allowNonPersistentStore,
});

notification.registerChannel(createInAppChannelDefinition());
notification.registerChannel(createEmailChannelDefinition());
```

`registerChannel()` 接收 Channel 定义。它必须在 `start()` 之前调用，不过配置中没有启用的 Channel 也可以提前注册。

如果 Email 收件人只提供 `userId`，可以注册邮件地址解析函数：

```ts
notification.registerChannel(
  createEmailChannelDefinition({
    async resolveUserEmail(userId): Promise<string | undefined> {
      return users.findEmail(userId);
    },
  }),
);
```

## 第三步：启动和关闭

应用开始处理业务请求前调用 `start()`：

```ts
await notification.start();
```

应用退出时调用 `close()`：

```ts
await notification.close();
```

关闭操作会释放 Notification Manager 创建的 Provider 资源。数据库和 QueueManager 仍由应用自己的生命周期管理。

## 第四步：挂载通知 API

如果应用需要日志查询和站内信 API，可以挂载 Manager 的 Hono router：

```ts
app.route("/api/notifications", notification.router);
```

挂载后可使用：

- `/api/notifications/logs`
- `/api/notifications/logs/:id`
- `/api/notifications/in-app/*`

:::warning 注意

核心日志路由不会替宿主应用配置 ACL。请在挂载层限制日志端点的访问权限。站内信端点会从 Session 中读取当前用户，并对修改操作检查 CSRF token。

:::

## 第五步：注册 migrations

使用数据库存储通知日志时，应用需要包含核心 migration：

```ts
export { default } from "@nocobase/notification/migrations/202608190001_create_notification_tables";
```

使用站内信时，另外包含站内信 migration：

```ts
export { default } from "@nocobase/notification-in-app/migrations/202608190002_create_notification_in_app_items";
```

至此，业务服务可以从应用服务中取得 `NotificationManager<AppNotificationChannels>` 并发送通知。
