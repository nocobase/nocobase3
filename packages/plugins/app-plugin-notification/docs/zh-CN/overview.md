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

一个新的 `idempotencyKey` 会创建一条 Notification；使用同一键重复提交等价请求时返回原 Notification，不会重复创建。每个收件人（或不需要收件人的 Channel）使用的每个 Channel 和 Provider 组合，都会生成一条独立的 Delivery。

```text
Notification
├── Delivery：user-1 / in-app
├── Delivery：user-1 / email / smtp
├── Delivery：user-1 / im / feishu
└── Delivery：user-1 / im / dingtalk
```

Delivery 保存接收人、消息以及选中的 Provider。真正调用 Provider 时，系统会为每次提交记录一条 Attempt。这样既能看到整条通知的结果，也能检查某一次 Provider 调用为什么失败。

## 当前能力

- 发送站内信、SMTP / Resend 邮件和飞书 / 钉钉群消息
- 一次发送给多个接收人和多个 Channel
- 保存 Delivery 和 Provider Attempt 日志
- 对明确失败的 Provider 调用进行延迟重试
- 通过租约恢复 Worker 中断后的任务
- 查看个人站内信、未读数以及已读状态

## 收件人与 Provider 标识

`NotificationManager.send()` 的 `to` 字段描述收件人，但它不是所有 Channel 都必填。核心包定义了统一的收件人形状，Channel 再判断这种收件人是否受支持，并把它解析为 Provider 可以使用的地址或投递信息。Webhook 类型的 IM Channel 可以省略 `to`，直接把选中的 Provider 作为发送目的地；站内信、邮件等需要收件人的 Channel 仍然需要提供 `to`。

其中：

| 字段位置                      | 示例             | 作用                                                                   |
| ----------------------------- | ---------------- | ---------------------------------------------------------------------- |
| `channels[].type`             | `im`             | 标识 Channel 类型，决定使用哪种通知通道。                              |
| `channels[].providers[].type` | `feishu-webhook` | 标识 Provider 实现类型，系统用它查找并创建对应的 Provider definition。 |
| `channels[].providers[].name` | `feishu`         | 标识当前 Channel 内的一条 Provider 配置，发送路由通过它选择 Provider。 |
| `to`                          | 可选             | 业务收件人。是否可以省略由 Channel 决定；内置 IM Webhook 可以省略。    |

`name` 和 `type` 不是同一个字段：`name` 是配置实例名称，`type` 是实现类型。`type` 不参与业务代码的 Provider 选择，但应用启动时会用它匹配并创建 Provider definition，Delivery 重试时也会用它校验 Provider 身份。发送时只需要通过 `name` 路由，不需要把 `type` 传给 `send()`；不过 `name` 和 `type` 都会写入 Delivery，配置更新和应用重启后应保持稳定。

飞书、钉钉 Webhook Provider 本身已经代表一个外部群机器人，不需要额外的业务收件人或 `target` 配置。可以配置多个 Provider，通过 Provider 的 `name` 路由到其中一个，或使用 `strategy: 'all'` 同时发送到多个 Provider。若自定义 IM Channel 支持用户收件人，也可以通过 resolver 把 `{ type: 'user', id: '...' }` 解析为外部地址。

## Provider 选择

每个 Channel 可以配置多个启用的 Provider。创建 Delivery 时，系统会保存 Provider 的 `name` 和 `type`；后续执行和重试必须匹配同一个 Provider。

如果重启后找不到匹配的 Provider，或者相同 `name` 被改成了另一种 `type`，该 Delivery 会失败，不会改用其他 Provider。

:::warning 注意

Provider 路由默认使用 `single` 策略。普通发送会选择 Channel 配置中第一个启用的 Provider。需要明确选择时，在 `routing.<channel>.providers.provider` 中填写 Provider `name`；同一个 Channel 内的 Provider `name` 必须唯一，不需要传 `type`。

只有需要同时投递到多个 Provider 时，才需要设置 `strategy: 'all'`。省略 `providers` 表示选择所有已启用的 Provider，也可以通过 `providers: ['feishu', 'dingtalk']` 限定名称。`single` 模式下 Provider 失败不会自动切换到另一个 Provider。

:::

## 文档地图

- [手动接入通知](./integration.md)——接入 migrations、运行时、路由和生命周期
- [配置通知 Provider](../../../app-plugin-notification-providers/docs/zh-CN/configuration.md)——配置 SMTP、Resend、飞书和钉钉
- [发送通知](./sending.md)——从服务端业务代码发送消息
- [通知日志](./logs.md)——查看 Delivery 和 Attempt

## 相关链接

- [手动接入通知](./integration.md)——创建并挂载通知运行时
- [配置通知 Provider](../../../app-plugin-notification-providers/docs/zh-CN/configuration.md)——构造 Email 和 IM Channel 的 Provider 配置
- [发送通知](./sending.md)——使用 `NotificationManager.send()`
- [通知日志](./logs.md)——查看 Delivery 和 Attempt
