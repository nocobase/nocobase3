# Notification

`@nocobase/notification` 为服务端应用提供统一的通知发送接口。应用启动时注册需要使用的 Channel，业务代码随后通过 `NotificationManager.send()` 发送给多个收件人和多个渠道。

如果你只需要发送通知，阅读「接入应用」和「发送通知」即可。只有需要配置新的 Provider 或开发新的 Channel 时，才需要阅读扩展文档。

## 快速索引

| 我想要……                                 | 去哪里看                                          |
| ---------------------------------------- | ------------------------------------------------- |
| 在应用中创建并启动 `NotificationManager` | [接入应用](./setup.md)                            |
| 配置站内信或 SMTP 邮件                   | [配置 Channel](./configuration.md)                |
| 给多个收件人发送站内信和邮件             | [发送通知](./sending.md)                          |
| 查询通知、收件人和 Provider 的发送结果   | [查询通知日志](./logs.md)                         |
| 开发新的 Channel 或 Provider             | [扩展 Channel 和 Provider](./channel-provider.md) |

## 最小示例

应用启动时创建 Manager，并注册非插件化的 Channel/Provider 定义：

```ts
const notification = createNotificationManager<AppNotificationChannels>({
  database: runtime.database,
  queue: deps.queueManager,
  logger: deps.logging.getLogger().child({ module: 'notification' }),
  config: runtime.config.notification,
});

// 已启用的通知插件在应用 bootstrap 阶段完成注册。
await notification.start();
```

站内信由 `@nocobase/app-plugin-notification-in-app` 自动注册；Email Channel 和 SMTP Provider 由 `@nocobase/app-plugin-notification-providers` 自动注册。

业务服务从应用服务中取得已经启动的 Manager：

```ts
await notification.send({
  recipients: [
    {
      userId: 'user-1',
      channels: [
        { channel: 'in-app', recipient: { userId: 'user-1' } },
        { channel: 'email', recipient: { address: 'user@example.com' } },
      ],
    },
  ],
  message: {
    'in-app': { title: '审批完成', body: '请查看审批结果。' },
    email: { subject: '审批完成', text: '请查看审批结果。' },
  },
});
```

`send()` 返回通知 ID 和 Delivery ID。发送由队列异步执行，你可以通过通知日志查询最终结果。
