---
title: '通知日志'
description: '查询 NocoBase Notification Delivery 日志和 Provider Attempt，检查通知投递状态。'
keywords: 'NocoBase,通知日志,Delivery,Attempt,Provider'
---

# 通知日志

`NotificationManager` 会保存 Notification、Delivery 和 Provider Attempt。你可以通过 `manager.logs` 查询这些记录，也可以把 `manager.router` 挂载到受认证的应用路由后使用日志 API。

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
- `failed`——投递失败；如果存在 `nextRunAt`，会在该时间后重试
- `unknown`——消息可能已经被 Provider 接受，不会自动重试

`accepted` 不等于终端用户已经阅读，也不保证供应商最终送达。遇到 `unknown` 时，应先查询供应商记录，再决定是否重新发送。

## 查看 Attempt

每次调用 Provider 都会生成一条 Attempt，其中包含：

- Attempt 序号
- Provider `name` 和 `type`
- Attempt 状态
- 错误信息

Delivery 表示当前投递结果，Attempt 用于保留每次 Provider 调用的历史。

## 通过服务端查询

业务代码可以直接查询通知日志：

```ts
const recent = await notification.logs.listDetails();
const details = await notification.logs.get(notificationId);
```

`listDetails()` 返回 Notification、Delivery 和 Attempt；`get()` 按 Notification ID 查询一条完整记录。

## 挂载日志 API

`manager.router` 提供以下路由：

- `GET /logs`
- `GET /logs/:id`

router 本身不添加宿主认证。挂载时需要在外层添加认证 middleware，完整接入方式见[手动接入通知](./integration.md)。

日志响应不会返回消息正文、接收人快照、`leaseToken` 或 `leaseExpiresAt`。Provider 名称、状态、时间和错误信息会保留，用于排查投递问题。

## 可选客户端页面

`packages/app-template-default/registry/nocobase-notification` 中的 `NotificationLogsPage` 可以展示 Delivery 和 Attempt。该 registry 只提供客户端页面，不会自动创建服务端 runtime 或挂载路由。

## 相关链接

- [通知概览](./overview.md)——了解 Notification、Delivery 和 Attempt
- [手动接入通知](./integration.md)——挂载受认证的日志 API
- [配置通知](./configuration.md)——配置 Channel 和 Provider
- [发送通知](./sending.md)——从服务端业务代码发送消息
