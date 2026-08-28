---
title: '通知概览'
description: '了解 NocoBase 站内信、邮件、IM Webhook 投递和 Delivery 日志能力。'
keywords: 'NocoBase,通知,站内信,邮件,飞书,钉钉,Notification'
---

# 通知概览

NocoBase 通知用于向用户发送站内信、邮件或 IM Webhook 消息，并记录每次投递的状态。通知包提供运行时和扩展点。默认模板通过核心插件 bootstrap 创建 `NotificationManager`，再由 Provider 插件 bootstrap 注册内置的 Email 和 IM definitions；其他宿主也可以手动完成相同的接入。

当前提供三个 Channel 实现：

- `in-app`——把消息写入用户的站内信收件箱
- `email`——通过 SMTP 或 Resend 发送邮件
- `im`——通过飞书或钉钉群机器人 Webhook 发送消息

## 一条通知是怎样发送的

一次 `send()` 调用会创建一条 Notification。每个收件人使用的每个 Channel，都会生成一条独立的 Delivery。

```text
Notification
├── Delivery：user-1 / in-app
├── Delivery：user-1 / email
└── Delivery：user-2 / in-app
```

Delivery 保存接收人、消息以及选中的 Provider。真正调用 Provider 时，系统会为每次提交记录一条 Attempt。这样既能看到整条通知的结果，也能检查某一次 Provider 调用为什么失败。

## 当前能力

- 发送站内信、SMTP / Resend 邮件和飞书 / 钉钉群消息
- 一次发送给多个接收人和多个 Channel
- 保存 Delivery 和 Provider Attempt 日志
- 对明确失败的 Provider 调用进行延迟重试
- 通过租约恢复 Worker 中断后的任务
- 查看个人站内信、未读数以及已读状态

## Provider 选择

每个 Channel 应配置一个启用的 Provider。创建 Delivery 时，系统会保存 Provider 的 `name` 和 `type`；后续执行和重试必须匹配同一个 Provider。

如果重启后找不到匹配的 Provider，或者相同 `name` 被改成了另一种 `type`，该 Delivery 会失败，不会改用其他 Provider。

:::warning 注意

当前版本不支持投递失败后的 Provider fallback。手动配置多个 Provider 时，普通发送会选择名为 `primary` 的 Provider，否则选择第一个。通常来说，每个 Channel 配置一个 Provider 就够了。默认模板也通过 `NOTIFICATION_EMAIL_PROVIDER` 和 `NOTIFICATION_IM_PROVIDER` 分别选择一个 Provider。

:::

## 文档地图

- [手动接入通知](./integration.md)——接入 migrations、运行时、路由和生命周期
- [配置通知](./configuration.md)——配置站内信和 SMTP 邮件
- [发送通知](./sending.md)——从服务端业务代码发送消息
- [通知日志](./logs.md)——查看 Delivery 和 Attempt

## 相关链接

- [手动接入通知](./integration.md)——创建并挂载通知运行时
- [配置通知](./configuration.md)——构造 Channel 和 Provider 配置
- [发送通知](./sending.md)——使用 `NotificationManager.send()`
- [通知日志](./logs.md)——查看 Delivery 和 Attempt
