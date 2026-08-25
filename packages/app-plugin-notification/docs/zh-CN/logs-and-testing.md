---
title: '日志与测试发送'
description: '在 NocoBase 中查看 Notification Delivery 日志、Provider Attempt，并发送测试站内信或邮件。'
keywords: 'NocoBase,通知日志,Delivery,Attempt,测试发送'
---

# 日志与测试发送

「Notifications / Delivery logs」页面展示最近的通知及其 Delivery。展开一条通知后，可以查看每个 Channel 的状态以及历次 Provider Attempt。

<!-- 需要一张 Delivery logs 页面展开通知和 Attempt 的截图。 -->

## 查看投递状态

Notification 汇总状态包括：

| 状态         | 含义                                         |
| ------------ | -------------------------------------------- |
| `pending`    | 所有 Delivery 仍在等待执行。                 |
| `processing` | 至少一条 Delivery 正在准备、提交或等待重试。 |
| `completed`  | 所有 Delivery 都已被 Provider 接受。         |
| `partial`    | 已结束的 Delivery 中同时存在成功和失败。     |
| `failed`     | 所有 Delivery 都已失败，并且没有等待重试。   |
| `unknown`    | 至少一次 Provider 提交的结果无法确认。       |

Delivery 还会出现 `preparing`、`submitting` 和 `accepted`。其中：

- `preparing`——正在校验接收人并生成 Provider 消息
- `submitting`——正在调用 Provider
- `accepted`——Provider 已接受本次提交
- `failed`——投递失败；如果存在 `nextRunAt`，系统会在该时间后重试
- `unknown`——消息可能已经被 Provider 接受，系统不会自动重试

`accepted` 不等于终端用户已经阅读，也不保证供应商最终送达。遇到 `unknown` 时，应先查询供应商记录，再决定是否重新发送。

## 查看 Attempt

每次调用 Provider 都会生成一条 Attempt，页面会显示：

- Attempt 序号
- Provider `name` 和 `type`
- Attempt 状态
- 错误信息

Delivery 与 Attempt 的职责不同——Delivery 表示当前投递结果，Attempt 用于保留每次 Provider 调用的历史。

## 发送测试通知

进入「Notifications / Delivery logs」，点击「Send test」。选择 Email 或 In-app，填写接收人和消息后提交。

<!-- 需要一张 Send a test notification 对话框的截图。 -->

Email 接收人填写一个或多个邮件地址。In-app 接收人填写一个或多个用户 ID。多个值可以用逗号或换行分隔。

测试发送使用真实的 Channel、Provider、队列和日志链路。提交后页面会刷新，并显示新建的 Notification。

## 查看个人站内信

当前用户可以在「Notifications / My notifications」查看自己的站内信。页面支持：

- 只看未读消息
- 标记单条消息已读或未读
- 全部标记已读
- 删除消息
- 加载更多消息

<!-- 需要一张 My notifications 页面和未读筛选的截图。 -->

## 日志中的敏感信息

日志 API 和默认页面不会返回消息正文、接收人快照、`leaseToken` 或 `leaseExpiresAt`。Provider 名称、状态、时间和错误信息会保留，用于排查投递问题。

## 通过服务端 API 查询

业务代码也可以直接查询通知日志：

```ts
const recent = await notification.logs.listDetails();
const details = await notification.logs.get(notificationId);
```

`listDetails()` 返回 Notification、Delivery 和 Attempt；`get()` 按 Notification ID 查询单条完整记录。

## 相关链接

- [通知概览](./overview.md)——了解 Notification、Delivery 和 Attempt
- [配置通知](./configuration.md)——配置站内信和 SMTP 邮件
- [发送通知](./sending.md)——从服务端业务代码发送消息
