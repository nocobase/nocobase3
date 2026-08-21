# 查询通知日志

发送通知后，可以通过 `NotificationManager.logs` 或 HTTP API 查询结果。一次通知包含一个汇总记录和多个 Delivery；每个收件人和 Channel 对应一个 Delivery。

## 使用默认界面

默认应用提供两个通知页面：

| 路径                    | 用途                                             |
| ----------------------- | ------------------------------------------------ |
| `/notifications`        | 查看 Email Delivery 和每次 Provider 尝试         |
| `/notifications/in-app` | 查看当前用户的站内信，并执行已读、未读和删除操作 |

站内信页面会显示未读数量。执行已读、未读或删除操作后，页面会重新查询当前未读数。

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
  throw new Error("Notification not found.");
}
```

完整记录的结构如下：

```ts
interface NotificationLogDetails {
  readonly log: NotificationLogRecord;
  readonly deliveries: readonly {
    readonly delivery: NotificationDeliveryRecord;
    readonly attempts: readonly NotificationAttemptRecord[];
  }[];
}
```

## 通过 HTTP API 查询

如果应用把 `notification.router` 挂载在 `/api/notifications`，可以使用：

| 方法 | 路径                          | 返回内容                              |
| ---- | ----------------------------- | ------------------------------------- |
| GET  | `/api/notifications/logs`     | 最近 100 条通知及其 Delivery、Attempt |
| GET  | `/api/notifications/logs/:id` | 指定通知的完整记录                    |

比如：

```ts
const response = await fetch("/api/notifications/logs", {
  credentials: "include",
});

if (!response.ok) {
  throw new Error(`Notification log request failed (${response.status}).`);
}

const { data } = await response.json();
```

:::warning 注意

日志中包含收件人和消息快照。宿主应用需要为日志 API 配置合适的认证和 ACL，不要直接开放给普通用户。

:::

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

Delivery 状态包括 `pending`、`sending`、`sent`、`failed` 和 `unknown`。

`sent` 表示 Provider 已接受本次提交，不等于终端用户已经阅读，也不一定等于供应商最终送达。`unknown` 表示外部服务可能已经接受消息，不过本地没有取得确定结果。遇到 `unknown` 时，先查询供应商记录，再决定是否重新发送。

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
const csrfResponse = await fetch("/api/notifications/in-app/csrf", {
  credentials: "include",
});
const { token } = await csrfResponse.json();

await fetch(`/api/notifications/in-app/${item.id}`, {
  method: "POST",
  credentials: "include",
  headers: {
    "content-type": "application/json",
    "x-csrf-token": token,
  },
  body: JSON.stringify({
    action: "read",
    expectedVersion: item.version,
  }),
});
```

单条操作的 `action` 可以是 `read`、`unread` 或 `delete`。`expectedVersion` 使用查询结果中的当前版本。
