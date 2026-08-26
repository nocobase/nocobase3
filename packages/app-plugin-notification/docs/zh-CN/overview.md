---
title: '通知概览'
description: '了解 NocoBase 通知、站内信、邮件投递和 Delivery 日志能力。'
keywords: 'NocoBase,通知,站内信,邮件,Notification'
---

# 通知概览

NocoBase 通知用于向用户发送站内信或邮件，并记录每次投递的状态。通知包提供运行时和扩展点，不会自动修改应用宿主。接入时需要由应用显式创建 `NotificationManager`、注册 Channel 和 Provider，并管理启动与释放。

当前提供两个 Channel 实现：

- `in-app`——把消息写入用户的站内信收件箱
- `email`——通过 SMTP 发送邮件

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

- 发送站内信和 SMTP 邮件
- 一次发送给多个接收人和多个 Channel
- 保存 Delivery 和 Provider Attempt 日志
- 对明确失败的 Provider 调用进行延迟重试
- 通过租约恢复 Worker 中断后的任务
- 查看个人站内信、未读数以及已读状态

## Provider 选择

每个 Channel 应配置一个启用的 Provider。创建 Delivery 时，系统会保存 Provider 的 `name` 和 `type`；后续执行和重试必须匹配同一个 Provider。

如果重启后找不到匹配的 Provider，或者相同 `name` 被改成了另一种 `type`，该 Delivery 会失败，不会改用其他 Provider。

:::warning 注意

当前版本不支持 Provider fallback。配置多个启用的 Provider 时，只会选择第一个。通常来说，每个 Channel 配置一个 Provider 就够了。

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
