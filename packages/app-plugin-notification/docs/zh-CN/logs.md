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

## Hub 设置页

启用插件的客户端贡献后，通知日志通过 `client/routes.ts` 中的 Settings Route Contribution 自动注册到 Hub Settings Center：

- 页面路径：`/hub/settings/notifications/logs`
- 权限资源：`page:notification.logs`
- 权限动作：`access`

Settings Contribution 与 `GET /api/notifications/logs` 使用同一个权限资源。Settings Center 会在页面加载前检查权限，服务端也会拒绝没有访问权限的请求。

页面右上角的 **Send test notification** 会列出当前启用的 Channel 和 Provider。选择站内信时需要填写接收用户 ID，选择 Email 时需要填写接收邮箱；IM 测试发送到所选 Webhook 所属群聊，不需要另填接收人。点击弹窗底部的 **Send** 后，页面调用 Notification Provider 插件的测试接口，通过常规 `NotificationManager` 发送真实消息，并自动刷新日志。

测试能力受服务端 `notification.test.enabled` 控制。默认应用模板通过 `config.yml` 中的 `notification.test` 配置开关和可选的默认测试邮箱；未显式启用时，测试弹窗会提示该应用没有开启 Provider 测试。

## 可选的应用自有页面

`@nocobase/app-plugin-notification` 发布的 `logs-ui` Registry item 仍提供可复制的 `NotificationLogsPage`，用于应用需要完全自行维护页面样式的场景。canonical source 位于 `packages/app-plugin-notification/registry/logs-ui`。默认 Hub 日志页由插件的 Settings Contribution 直接提供，不需要安装该 Registry item。

## 相关链接

- [通知概览](./overview.md)——了解 Notification、Delivery 和 Attempt
- [手动接入通知](./integration.md)——挂载受认证的日志 API
- [配置通知 Provider](../../../app-plugin-notification-providers/docs/zh-CN/configuration.md)——配置 Email 和 IM Channel 的 Provider
- [发送通知](./sending.md)——从服务端业务代码发送消息
