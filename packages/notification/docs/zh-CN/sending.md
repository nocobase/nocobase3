---
title: '发送通知'
description: '使用 NocoBase NotificationManager 发送站内信和邮件，并读取发送结果。'
keywords: 'NocoBase,NotificationManager,发送通知,站内信,邮件'
---

# 发送通知

服务端业务代码通过 `NotificationManager.send()` 发送通知。一个调用可以包含多个接收人，每个接收人也可以选择多个 Channel。

## 发送站内信

站内信的接收人需要提供用户 ID：

```ts
const result = await notification.send({
  source: {
    type: 'workflow',
    referenceId: 'workflow-42',
  },
  recipients: [
    {
      channels: [
        {
          channel: 'in-app',
          recipient: { userId: 'user-1' },
        },
      ],
    },
  ],
  message: {
    'in-app': {
      title: '审批待处理',
      body: '你有一条新的审批任务。',
      actionUrl: '/approvals/approval-2026-001',
    },
  },
});
```

`source` 是可选的业务来源。`type` 和 `referenceId` 会进入通知日志，方便服务端按业务记录追踪通知。

## 发送邮件

当前默认 Email Channel 需要直接提供邮件地址：

```ts
await notification.send({
  recipients: [
    {
      channels: [
        {
          channel: 'email',
          recipient: { address: 'alice@example.com' },
        },
      ],
    },
  ],
  message: {
    email: {
      subject: '审批待处理',
      text: '你有一条新的审批任务。',
      html: '<p>你有一条新的审批任务。</p>',
    },
  },
});
```

邮件的 `subject` 和 `text` 必填，`html` 和 `from` 可选。默认应用没有配置用户 ID 到邮箱地址的解析器，因此只传 `userId` 无法发送邮件。

## 同时发送多个 Channel

同一个接收人可以同时收到站内信和邮件：

```ts
await notification.send({
  recipients: [
    {
      channels: [
        {
          channel: 'in-app',
          recipient: { userId: 'user-1' },
        },
        {
          channel: 'email',
          recipient: { address: 'alice@example.com' },
        },
      ],
    },
  ],
  message: {
    'in-app': {
      title: '审批完成',
      body: '请查看审批结果。',
    },
    email: {
      subject: '审批完成',
      text: '请查看审批结果。',
    },
  },
});
```

这次调用会创建两条 Delivery。`message` 必须包含接收人所选择的每个 Channel，否则 `send()` 会直接抛出错误。

## 读取返回结果

`send()` 返回 Notification ID 和每条 Delivery 的 ID：

```ts
const result = await notification.send(input);

result.notificationId;
result.status;
result.deliveries[0]?.id;
```

新建 Notification 和 Delivery 的初始状态是 `pending`，只表示通知已经保存并交给队列，不表示 Provider 已接受消息。需要最终结果时，通过日志查询：

```ts
const details = await notification.logs.get(result.notificationId);
```

## 常见输入错误

以下情况会直接抛出错误：

- Notification Manager 尚未完成启动
- `recipients` 为空
- 没有任何 Channel 目标
- `message` 缺少接收人选择的 Channel
- 使用了未启用的 Channel
- Channel 没有可用的 Provider

地址解析、消息校验和 Provider 调用在队列任务中执行。遇到这类错误时，`send()` 可能已经返回，需要到 Delivery 日志中查看结果。

## 相关链接

- [通知概览](./overview.md)——了解一次发送如何拆分为 Delivery
- [配置通知](./configuration.md)——启用站内信和 SMTP 邮件
- [日志与测试发送](./logs-and-testing.md)——查询最终投递结果
