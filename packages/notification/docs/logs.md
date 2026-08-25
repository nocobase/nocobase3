# 查询通知日志

发送通知后，可以通过 `NotificationManager.logs` 或 HTTP API 查询结果。一次通知包含一个汇总记录和多个 Delivery；每个收件人和 Channel 对应一个 Delivery。

## 通过 Manager 查询

查询最近的汇总记录：

```ts
const records = await notification.logs.list();
```

查询最近的完整记录：

```ts
const records = await notification.logs.listDetails();
```

按通知 ID 查询：

```ts
const details = await notification.logs.get(notificationId);

if (!details) {
  throw new Error('Notification not found.');
}
```

完整记录的结构如下：

```ts
interface NotificationLogDetails {
  readonly log: Omit<NotificationLogRecord, 'messageSnapshot'>;
  readonly deliveries: readonly {
    readonly delivery: Omit<
      NotificationDeliveryRecord,
      | 'recipientKey'
      | 'recipientSnapshot'
      | 'messageSnapshot'
      | 'leaseToken'
      | 'leaseExpiresAt'
    >;
    readonly attempts: readonly NotificationAttemptRecord[];
  }[];
}
```

## 判断结果

通知汇总状态包括：

| 状态         | 含义                                   |
| ------------ | -------------------------------------- |
| `pending`    | 所有 Delivery 仍在等待执行             |
| `processing` | 至少一个 Delivery 正在等待或发送       |
| `completed`  | 所有 Delivery 均已被 Provider 接受     |
| `partial`    | 已结束的 Delivery 中同时存在成功和失败 |
| `failed`     | 所有 Delivery 均失败                   |
| `unknown`    | 至少一个 Delivery 的提交结果无法确认   |

Delivery 状态包括 `pending`、`preparing`、`submitting`、`accepted`、`failed` 和 `unknown`。

`accepted` 表示 Provider 已接受本次提交，不等于终端用户已经阅读，也不一定等于供应商最终送达。带 `nextRunAt` 的 `failed` 表示已安排持久化重试；`unknown` 表示外部服务可能已经接受消息，不过本地没有取得确定结果。遇到 `unknown` 时，先查询供应商记录，再决定是否重新发送。

应用通过 `/api/notifications/logs` 和 `/api/notifications/logs/:id` 提供受认证保护的日志查询，返回内容会移除消息正文、收件人快照和租约 token。核心包同时提供 `notification.logs` 服务，供应用在自己的授权边界内挂载查询接口。

默认应用的日志页面提供“发送测试”操作，通过受认证保护的 `/api/notifications/test/email` 和 `/api/notifications/test/in-app` 进入真实 Channel、Provider、队列和日志链路，便于验证配置与投递状态。

## 查询站内信

站内信 API 只返回当前 Session 用户的数据：

| 方法 | 路径                                     | 用途                          |
| ---- | ---------------------------------------- | ----------------------------- |
| GET  | `/api/notifications/in-app/`             | 查询站内信列表                |
| GET  | `/api/notifications/in-app/unread-count` | 查询未读数                    |
| GET  | `/api/notifications/in-app/csrf`         | 获取修改操作所需的 CSRF token |
| POST | `/api/notifications/in-app/read-all`     | 全部标记已读                  |
| POST | `/api/notifications/in-app/:id`          | 标记已读、未读或删除          |

修改单条站内信时，请先取得 CSRF token：

```ts
const csrfResponse = await fetch('/api/notifications/in-app/csrf', {
  credentials: 'include',
});
const { token } = await csrfResponse.json();

await fetch(`/api/notifications/in-app/${item.id}`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'content-type': 'application/json',
    'x-csrf-token': token,
  },
  body: JSON.stringify({
    action: 'read',
    expectedVersion: item.version,
  }),
});
```

单条操作的 `action` 可以是 `read`、`unread` 或 `delete`。`expectedVersion` 使用查询结果中的当前版本。
