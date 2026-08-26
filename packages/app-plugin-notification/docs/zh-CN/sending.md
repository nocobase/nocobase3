---
title: '发送通知'
description: '使用 NocoBase NotificationManager 发送站内信和邮件，并读取发送结果。'
keywords: 'NocoBase,NotificationManager,发送通知,站内信,邮件'
---

# 发送通知

服务端业务代码通过 `NotificationManager.send()` 发送通知。一个调用可以包含多个接收人，并将同一份通知内容发送到多个 Channel。

## 发送站内信

站内信的接收人需要提供用户 ID：

```ts
const result = await notification.send({
  source: {
    type: 'workflow',
    referenceId: 'workflow-42',
  },
  to: { type: 'user', id: 'user-1' },
  channels: ['in-app'],
  content: {
    title: '审批待处理',
    body: '你有一条新的审批任务。',
    actionUrl: '/approvals/approval-2026-001',
  },
});
```

`source` 是可选的业务来源。`type` 和 `referenceId` 会进入通知日志，方便服务端按业务记录追踪通知。

## 发送邮件

Email Channel 可以直接接收邮件地址：

```ts
await notification.send({
  to: { type: 'email', address: 'alice@example.com' },
  channels: ['email'],
  content: {
    title: '审批待处理',
    body: '你有一条新的审批任务。',
  },
});
```

默认 renderer 将 `content.title` 映射为邮件主题，将 `content.body` 映射为纯文本正文。如果宿主没有给 `createEmailChannelDefinition()` 配置用户 ID 到邮箱地址的 resolver，那么只传用户 ID 无法发送邮件。

## 多个接收人与 Channel

多个接收人可以共享同一份内容和 Channel：

```ts
await notification.send({
  to: [
    { type: 'user', id: 'user-1' },
    { type: 'user', id: 'user-2' },
  ],
  channels: ['in-app', 'email'],
  content: {
    title: '审批完成',
    body: '请查看审批结果。',
  },
});
```

上面的调用会创建四条 Delivery（2 个接收人 × 2 个 Channel）。每个 Channel 的 recipient resolver 负责把统一接收人转换成对应地址。

如果某个 Channel 需要不同字段，使用 `channelOverrides`：

```ts
await notification.send({
  to: { type: 'user', id: 'user-1' },
  channels: ['in-app', 'email'],
  content: {
    title: '审批完成',
    body: '请查看审批结果。',
  },
  channelOverrides: {
    email: {
      subject: '审批完成｜NocoBase',
      html: '<p>请查看审批结果。</p>',
    },
  },
});
```

Provider 由 Channel 配置统一选择；普通业务代码不需要维护 Provider 名称或底层 Delivery 字段。

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

- 配置的 Channel 或 Provider Definition 尚未由插件注册
- `to` 为空
- 没有任何 Channel
- 使用了未启用的 Channel
- Channel 不支持通用内容
- Channel 没有可用的 Provider

Channel 不支持某种接收人时，对应组合会创建一条失败的 Delivery，其他接收人与 Channel 仍可继续投递。地址解析、消息校验和 Provider 调用在队列任务中执行；这些阶段失败时，`send()` 可能已经返回，需要到 Delivery 日志中查看结果。

## 相关链接

- [通知概览](./overview.md)——了解一次发送如何拆分为 Delivery
- [配置通知](./configuration.md)——启用站内信和 SMTP 邮件
- [手动接入通知](./integration.md)——创建 manager 并注册 Channel / Provider
- [通知日志](./logs.md)——查询最终投递结果
