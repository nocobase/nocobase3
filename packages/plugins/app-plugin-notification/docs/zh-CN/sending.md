---
title: '发送通知'
description: '使用 NocoBase NotificationManager 发送站内信、邮件和 IM Webhook 消息，并读取发送结果。'
keywords: 'NocoBase,NotificationManager,发送通知,站内信,邮件,飞书,钉钉'
---

# 发送通知

服务端业务代码通过 `NotificationManager.send()` 发送通知。一个调用可以包含多个接收人，并将同一份通知内容发送到多个 Channel；对于不需要收件人的 Webhook Channel，也可以省略 `to`。

## 收件人与可选的 `to`

`to` 是可选的通知收件人。需要收件人的 Channel 必须提供它；飞书、钉钉这类 Webhook Channel 可以省略 `to`，直接向选中的 Provider 发送。核心包支持以下收件人形状，实际能否发送由对应 Channel 的收件人解析器（recipient resolver）决定：

| `to.type` | 示例                                              | 说明                                                       |
| --------- | ------------------------------------------------- | ---------------------------------------------------------- |
| `user`    | `{ type: 'user', id: 'user-1' }`                  | 通过用户 ID 发送。Channel 需要提供对应的用户地址解析能力。 |
| `email`   | `{ type: 'email', address: 'alice@example.com' }` | 直接向邮箱地址发送。                                       |

Provider 路由中的 `provider` 是 Provider 名称。`routing.im.providers.provider: 'feishu'` 表示选择名为 `feishu` 的 Webhook Provider；也可以使用 `strategy: 'all'` 同时选择多个 Provider。

## 发送站内信

站内信的接收人需要提供用户 ID：

```ts
const result = await notification.send({
  idempotencyKey: 'workflow:workflow-42:user-1:in-app',
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
  idempotencyKey: 'approval:approval-2026-001:alice:email',
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
  idempotencyKey: 'approval:approval-2026-001:users-1-2:in-app-email',
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
  idempotencyKey: 'approval:approval-2026-001:user-1:in-app-email',
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

## 选择 Provider

Provider 路由默认使用 `single` 策略。大部分时候不需要传 `routing`——系统会选择当前 Channel 配置中第一个启用的 Provider。

如果一个 Channel 配置了多个 Provider，并且你需要明确选择其中一个，只需要传 Provider 的 `name`：

```ts
await notification.send({
  idempotencyKey: 'approval:approval-2026-001:alice:primary-smtp',
  to: { type: 'email', address: 'alice@example.com' },
  channels: ['email'],
  routing: {
    email: {
      providers: {
        provider: 'primary-smtp',
      },
    },
  },
  content: {
    title: '审批待处理',
    body: '你有一条新的审批任务。',
  },
});
```

同一个 Channel 内的 Provider `name` 必须唯一，所以发送时不需要再传 Provider `type`。省略 `strategy` 就是 `single`，上面的写法等同于显式传入 `strategy: 'single'`。

Provider 路由支持这些写法：

| 配置                                                                    | 行为                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------- |
| 省略 `routing`                                                          | 默认使用 `single`，选择配置中的第一个启用 Provider。     |
| `{ providers: { provider: 'primary-smtp' } }`                           | 默认使用 `single`，选择指定名称的 Provider。             |
| `{ providers: { strategy: 'single' } }`                                 | 选择默认 Provider。                                      |
| `{ providers: { strategy: 'all' } }`                                    | 为当前 Channel 的所有已启用 Provider 分别创建 Delivery。 |
| `{ providers: { strategy: 'all', providers: ['feishu', 'dingtalk'] } }` | 只向列出的 Provider 分别创建 Delivery。                  |

`single` 只表示一次发送为这个 Channel 选择一个 Provider。Provider 投递失败后不会自动切换到另一个 Provider。

## 发送飞书或钉钉消息

飞书和钉钉 Webhook Provider 自身就是发送目的地，因此发送 IM 消息时可以省略 `to`：

```ts
await notification.send({
  idempotencyKey: 'deployment:42:im',
  channels: ['im'],
  content: {
    title: '部署完成',
    body: '生产环境已经完成部署。',
    actionUrl: 'https://example.com/deployments/42',
  },
});
```

如果只发送到飞书，可以通过路由指定 Provider。`provider` 的值必须与配置中的 Provider `name` 一致；它不会使用 Provider 的 `type`：

```ts
await notification.send({
  idempotencyKey: 'deployment:42:feishu',
  channels: ['im'],
  routing: {
    im: {
      providers: {
        provider: 'feishu',
      },
    },
  },
  content: { title: '部署完成', body: '生产环境已经完成部署。' },
});
```

如果你通过 `createImChannelDefinition()` 提供了用户 ID 到外部 IM 地址的 resolver，也可以传 `{ type: 'user', id: 'user-1' }`。

如果要同时发送到所有已启用的 IM Provider，使用 `strategy: 'all'`。每个 Provider 会创建一条独立 Delivery：

```ts
await notification.send({
  idempotencyKey: 'deployment:42:all-im',
  channels: ['im'],
  routing: { im: { providers: { strategy: 'all' } } },
  content: {
    title: '部署完成',
    body: '生产环境已经完成部署。',
  },
});
```

## 读取返回结果

`send()` 返回 Notification ID、调用方提供的幂等键、是否命中已有任务，以及每条 Delivery 的当前快照：

```ts
const result = await notification.send(input);

result.notificationId;
result.idempotencyKey;
result.deduplicated;
result.status;
result.deliveries[0]?.id;
result.deliveries[0]?.provider;
```

异步队列中，新建 Notification 和 Delivery 通常是 `pending` 或 `processing`，只表示通知已经保存并交给队列，不表示 Provider 已接受消息。同步队列中，返回时也可能已经是终态。需要结果时，通过公开服务查询：

```ts
const byKey = await notification.getByIdempotencyKey(result.idempotencyKey);
const byId = await notification.getNotification(result.notificationId);
```

同一进程内可以使用非阻塞事件监听。订阅时如果状态已经存在，会先异步回调当前快照；之后回调由当前 manager 进程尽力发送。它不是持久化事件流，跨进程或服务重启后仍应使用查询接口兜底：

```ts
const unsubscribe = notification.onStatusChanged(
  { notificationId: result.notificationId },
  (state) => {
    renderStatus(state);
    if (state.terminal) unsubscribe();
  },
);
```

## 幂等与 Delivery 重试

`idempotencyKey` 必传，由调用方按业务事件、收件人范围（无收件人时使用 Channel 范围），以及必要时的 Provider 范围稳定生成。同一逻辑发送发生超时、重复提交或服务恢复时必须复用原键。相同键和等价输入返回原 Notification，并令 `deduplicated` 为 `true`；相同键配不同内容会抛出 `IDEMPOTENCY_KEY_CONFLICT`。当前不提供 `idempotencyExpiresAt`，键不会因调用方等待超时而自动失效。

对终态 `failed`，可在问题修复后调用 `retryDelivery`。如果 Delivery 已有 `nextRunAt`，表示自动重试已排期，不允许再手工重试。接收人类型不受 Channel 支持时，原 Delivery 无法原地修正，必须用正确接收人发起新的业务发送。

所有手工重试都必须提供非空 `reason`。服务端会根据 Delivery 状态和 Provider 幂等能力记录内部处理类型。对 `unknown`，如果 Provider 无法保证安全幂等，那么调用重试就表示接受可能重复发送的风险，`reason` 应写明判断依据：

```ts
await notification.retryDelivery({
  deliveryId,
  reason: 'Provider 后台未找到对应提交记录，业务同意重新发送。',
});
```

状态快照里的 `retry.allowed` 表示服务端是否接受手工重试请求。无法保证幂等的 `unknown` 仍会返回 `allowed: true`，同时通过 `mode: 'duplicate_risk_confirmation_required'` 提示调用方展示重复风险并要求填写 `reason`。

重试会先在原 Delivery 上写入 Retry Audit，不创建新的 Notification。服务端内部记录 `terminal_failure`、`safe_provider_idempotency` 或 `duplicate_risk_accepted`；只有进入 Provider 提交阶段才会创建新的 Attempt。如果幂等窗口在请求被接受后、Provider 提交前过期，服务端仍会执行这次人工重试，并把实际 Attempt 标记为 `duplicate_risk_accepted`。

## 常见输入错误

以下情况会直接抛出错误：

- 配置的 Channel 或 Provider Definition 尚未由插件注册
- `to` 显式传入空数组
- 没有任何 Channel
- 使用了未启用的 Channel
- Channel 不支持通用内容
- Channel 没有可用的 Provider
- `idempotencyKey` 为空、包含首尾空白或超过 191 个字符
- 同一 `idempotencyKey` 被用于不同请求内容

如果省略 `to`，需要收件人的 Channel 会创建一条失败的 Delivery，并且不会调用外部 Provider；支持无收件人发送的 Channel（例如 IM Webhook）则会正常投递。

Channel 不支持某种接收人时，对应组合会创建一条失败的 Delivery，其他接收人与 Channel 仍可继续投递。地址解析、消息校验和 Provider 调用在队列任务中执行；这些阶段失败时，`send()` 可能已经返回，需要到 Delivery 日志中查看结果。

## 相关链接

- [通知概览](./overview.md)——了解一次发送如何拆分为 Delivery
- [配置通知 Provider](../../../app-plugin-notification-providers/docs/zh-CN/configuration.md)——启用 Email 和 IM Provider
- [手动接入通知](./integration.md)——创建 manager 并注册 Channel / Provider
- [通知日志](./logs.md)——查询最终投递结果
