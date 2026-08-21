# 发送通知

业务代码只需要调用 `NotificationManager.send()`。一个调用可以包含多个收件人，每个收件人也可以选择多个 Channel。

## 发送站内信

```ts
const result = await notification.send({
  source: {
    type: "workflow",
    referenceId: "workflow-42",
  },
  recipients: [
    {
      userId: "user-1",
      channels: [
        {
          channel: "in-app",
          recipient: {
            userId: "user-1",
          },
        },
      ],
    },
  ],
  message: {
    "in-app": {
      title: "审批待处理",
      body: "你有一条新的审批任务。",
      actionUrl: "/approvals/approval-2026-001",
    },
  },
});
```

`source` 是可选的业务来源。日志页面可以用 `type` 和 `referenceId` 回溯触发通知的业务记录。

## 发送邮件

如果已经知道邮件地址，可以直接传 `address`：

```ts
await notification.send({
  recipients: [
    {
      userId: "user-1",
      channels: [
        {
          channel: "email",
          recipient: {
            address: "alice@example.com",
          },
        },
      ],
    },
  ],
  message: {
    email: {
      subject: "审批待处理",
      text: "你有一条新的审批任务。",
      html: "<p>你有一条新的审批任务。</p>",
    },
  },
});
```

如果注册 Email Channel 时配置了 `resolveUserEmail`，那么也可以只传 `userId`：

```ts
{
  channel: "email",
  recipient: {
    userId: "user-1",
  },
}
```

`EmailMessage` 的 `subject` 和 `text` 必填，`html` 和 `from` 可选。

## 发送给多个收件人和多个 Channel

```ts
const result = await notification.send({
  source: {
    type: "approval",
    referenceId: "approval-2026-001",
  },
  recipients: [
    {
      userId: "user-1",
      channels: [
        {
          channel: "in-app",
          recipient: { userId: "user-1" },
        },
        {
          channel: "email",
          recipient: { address: "alice@example.com" },
        },
      ],
    },
    {
      userId: "user-2",
      channels: [
        {
          channel: "in-app",
          recipient: { userId: "user-2" },
        },
      ],
    },
  ],
  message: {
    "in-app": {
      title: "审批待处理",
      body: "你有一条新的审批任务。",
      actionUrl: "/approvals/approval-2026-001",
    },
    email: {
      subject: "审批待处理",
      text: "你有一条新的审批任务。",
    },
  },
});
```

这个调用生成三个 Delivery：

- `user-1` 的站内信
- `user-1` 的邮件
- `user-2` 的站内信

`message` 按 Channel 提供内容。收件人选择了某个 Channel，就必须在 `message` 中提供该 Channel 的消息。

## 读取返回结果

```ts
interface NotificationSendResult {
  readonly notificationId: string;
  readonly status: "pending";
  readonly deliveries: readonly {
    readonly id: string;
    readonly channel: string;
    readonly status: "pending";
  }[];
}
```

`send()` 返回时，通知已经保存并等待队列执行，因此状态为 `pending`。它不代表邮件供应商或站内信 Provider 已经处理完成。

可以保存 `notificationId`，随后通过 [通知日志](./logs.md) 查询结果：

```ts
const details = await notification.logs.get(result.notificationId);
```

## 常见输入错误

以下情况会直接抛出错误：

- Manager 尚未完成 `start()`
- `recipients` 为空
- 没有任何 Channel 目标
- 收件人选择了 Channel，但 `message` 中缺少对应内容
- 使用了未启用的 Channel

Channel 自己的校验在异步发送时执行。比如 Email 地址无法解析时，`send()` 已经返回，后续可以在通知日志中看到该 Delivery 的失败结果。
