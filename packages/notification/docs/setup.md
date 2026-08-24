# 接入应用

在 NocoBase 服务端应用中，**`NotificationManager`** 是通知服务的公共入口。应用负责提供数据库、队列、logger 和通知配置；业务模块不需要在每次发送时重复传入这些依赖。

## 第一步：定义应用支持的 Channel

Channel map 用于约束 `send()` 的收件人和消息类型：

```ts
import type {
  EmailMessage,
  EmailRecipient,
} from '@nocobase/app-plugin-notification-providers';
import type {
  InAppMessage,
  InAppRecipient,
} from '@nocobase/app-plugin-notification-in-app';

export interface AppNotificationChannels {
  readonly 'in-app': {
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

## 第二步：创建 Manager 并注册扩展

在应用服务初始化时创建 Manager：

```ts
import { createNotificationManager } from '@nocobase/notification';

const notification = createNotificationManager<AppNotificationChannels>({
  database: runtime.database,
  queue: deps.queueManager,
  logger: deps.logging.getLogger('notification'),
  config: runtime.config.notification,
});
```

通知模块使用结构化 `event` 字段记录 Manager 生命周期、Channel/Provider
装配、投递结果和 reconcile 恢复情况。日志不会包含收件地址或消息正文。使用独立的
`notification` logger 后，可以通过应用的 logging 配置单独调整日志级别和输出目标；
生命周期和恢复结果使用 `info`，投递失败使用 `warn`/`error`，逐次投递详情使用
`debug`。

`registerChannel()` 和 `registerProvider()` 必须在 `start()` 之前调用。站内信由启用的 `@nocobase/app-plugin-notification-in-app` 自动注册；Email Channel 和 SMTP Provider 由启用的 `@nocobase/app-plugin-notification-providers` 自动注册，应用服务不需要手动调用。

如果 Email 收件人只提供 `userId`，可以扩展 Provider 插件，在它的 bootstrap 中注册带邮箱解析器的 Email Channel 实现。

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

如果应用需要站内信 API，可以挂载 Manager 的 Hono router：

```ts
app.route('/api/notifications', notification.router);
```

挂载后可使用 `/api/notifications/in-app/*`。站内信端点会从 Session 中读取当前用户，并对修改操作检查 CSRF token。

## 第五步：注册 migrations

使用数据库存储通知日志时，应用需要包含核心 migration：

```ts
export { default } from '@nocobase/notification/migrations/202608190001_create_notification_tables';
```

使用站内信时，`@nocobase/app-plugin-notification-in-app` 的 manifest 会自动提供站内信 migration。

至此，业务服务可以从应用服务中取得 `NotificationManager<AppNotificationChannels>` 并发送通知。
