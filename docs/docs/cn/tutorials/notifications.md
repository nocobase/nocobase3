---
title: '5. 发通知'
description: '审批通过后通知申请人，并用投递日志确认结果。'
keywords: 'NocoBase,通知教程,审批通知,站内信,邮件,幂等'
---

# 5. 发通知

审批通过后，申请人应该马上收到一条消息。本教程沿用前面审批流程的场景，使用 NocoBase 通知服务发送站内信，并说明如何按需增加 Email、避免重复发送以及检查投递结果。

:::tip 前置阅读

- [通知](../capabilities/notification.md)——了解 Channel、Provider、Delivery 和通知状态
- [工作流快速开始](../capabilities/workflow/quick-start.md)——了解如何让应用 Agent 开发和验证工作流

:::

## 最终效果

完成后，应用会具备这些行为：

- 审批通过后，给申请人发送一条站内信
- 通知带有标题、正文和回到订单详情页的链接
- 同一次审批事件重复执行时，不会创建第二条通知
- 通知日志中可以看到每个 Channel、Provider 和 Attempt 的状态
- 如果配置了 Email，还可以把同一业务结果发送到邮箱

<!-- 需要一张展示审批通过后收到通知，以及「通知日志」中对应投递记录的截图。 -->

## 开始之前

- 当前目录是一个基于 NocoBase 3 应用模板创建的应用
- 应用已经注册 `@nocobase/app-plugin-workflow` 和通知相关插件
- 应用已经有审批数据和申请人用户 ID
- 你可以让应用 Agent 读取和修改当前应用源码
- 你拥有查看通知日志和发送测试通知所需的权限

默认模板已经注册通知插件。如果应用是自定义组装的，先检查插件状态：

```bash
pnpm plugin:inspect notification
pnpm plugin:inspect notification-in-app
pnpm plugin:inspect notification-providers
```

缺少插件时再注册需要的包，然后执行迁移：

```bash
pnpm plugin:register notification
pnpm plugin:register notification-in-app
pnpm plugin:register notification-providers
pnpm migrate
```

## 第一步：打开站内信渠道

在应用的 `config.yml` 中确认站内信已经启用：

```yaml
notification:
  channels:
    - type: in-app
      enabled: true
      providers:
        - type: database
          name: default
```

如果这是刚创建的应用，配置模板通常已经包含这段内容。修改配置后重启开发服务，让服务端重新读取配置。

站内信使用用户 ID 作为接收人，不需要 SMTP 或 Webhook 凭据。先用站内信完成闭环，再增加 Email 或 IM，排查范围会更小。

## 第二步：让应用 Agent 接入审批结果

不要先指定某个不存在的“通知节点”。默认工作流提供 `Run` 节点，应用 Agent 应先检查当前应用的 Workflow Skill 和 Service 合同，再在审批通过的业务路径中调用通知服务。

可以把下面的需求交给应用 Agent：

> 请先读取当前应用的通知 Skill、工作流定义、审批 Service 和用户数据结构。
>
> 审批状态变为 approved 后，给申请人发送一条站内信。消息标题为“审批已通过”，正文包含订单号，点击后进入订单详情页。调用必须通过已注册的 `notificationServiceToken`，不能直接调用 Provider。
>
> 请使用审批记录和版本构造稳定的 `idempotencyKey`。同一个审批事件因工作流恢复、队列重试或请求超时再次执行时，不能创建第二条通知。请补充成功、重复执行和通知服务不可用时的测试，并运行类型检查、测试和构建。

服务端业务代码的核心形态如下：

```ts
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';

const notification = app.container.resolve(notificationServiceToken);

await notification.send({
  // 同一个审批事件始终复用同一个 key
  idempotencyKey: `approval:${approval.id}:approved:${approval.version}`,
  source: {
    type: 'approval',
    referenceId: approval.id,
  },
  to: { type: 'user', id: approval.requesterId },
  channels: ['in-app'],
  content: {
    title: '审批已通过',
    body: `订单 ${approval.orderNo} 已通过审批。`,
    actionUrl: `/orders/${approval.orderId}`,
  },
});
```

这段代码中的字段需要替换成当前应用真实的审批字段。不要直接照抄 `approval.requesterId`、`approval.orderNo` 或 `approval.orderId`，先让 Agent 检查实际 Schema 和 Service。

## 第三步：按需增加 Email

如果申请人还需要收到邮件，在 `config.yml` 中增加 Email Channel。SMTP 是最直接的选择：

```yaml
notification:
  channels:
    - type: email
      enabled: true
      providers:
        - type: smtp
          name: smtp
          host: smtp.example.com
          port: 587
          secure: false
          auth:
            user: mailer@example.com
            pass: replace-with-the-smtp-password
          from: NocoBase <mailer@example.com>
```

如果使用 Email Channel 发送给 `{ type: 'user', id: '...' }`，应用还需要配置用户 ID 到邮箱地址的 resolver。也可以在业务代码中直接使用邮箱地址：

```ts
await notification.send({
  idempotencyKey: `approval:${approval.id}:approved:email`,
  to: { type: 'email', address: approval.requesterEmail },
  channels: ['email'],
  content: {
    title: '审批已通过',
    body: `订单 ${approval.orderNo} 已通过审批。`,
  },
});
```

如果站内信和邮件都要发送，可以在一次调用中写 `channels: ['in-app', 'email']`。不过只有当所有接收人都能被两个 Channel 解析时，才适合共用一次调用；否则应拆成两次发送，并分别使用稳定的幂等键。

## 第四步：检查代码并运行迁移

要求应用 Agent 报告实际执行的命令和结果。至少检查：

```bash
pnpm migrate
pnpm typecheck
pnpm test
pnpm build
```

重点确认：

- 通知插件和工作流插件都出现在应用的注册入口中
- Notification、Delivery、Attempt 和站内信数据表已经完成迁移
- 审批成功路径确实调用了通知服务，而不是只创建了一个未被使用的函数
- `idempotencyKey` 在同一业务事件的重试中保持不变
- `actionUrl` 是应用自己的页面路径
- 测试没有把真实邮箱、Webhook URL、密码或 API Key 写进日志

## 第五步：发送一条测试通知

登录应用后，进入「设置 / 通知 / 通知日志」，点击「发送测试通知」。

<!-- 需要一张「发送测试通知」对话框的截图，展示选择通知方式、填写收件人和点击「发送」。 -->

先选择「站内信」，接收用户 ID 可以填写自己的 ID，消息标题和正文使用测试内容即可。点击「发送」后，页面会将测试消息交给正式的 Notification Manager，并在日志中创建 Notification、Delivery 和 Attempt。

如果没有可选择的通知方式，检查下面几项：

- 对应的 Channel 插件已经注册
- `config.yml` 中的 Channel 和 Provider 都设置了 `enabled: true`
- Provider 的 `type` 与插件定义一致
- 修改配置后应用已经重启
- 当前账号拥有 `page:notification.logs` 的 `access` 权限；提交测试消息还需要 `notification:test` 的 `send` 权限

测试消息会产生真实的站内信或外部消息。发送 Email 或 IM 前，先确认收件地址和目标群组。

## 第六步：触发审批并查看投递结果

用测试数据提交一条审批，并完成审批。回到「设置 / 通知 / 通知日志」后，按来源和创建时间找到这条通知，展开记录查看：

1. Notification 的整体状态
2. 每个 Delivery 使用的 Channel 和 Provider
3. Attempt 次数和最新状态
4. 失败原因或下一次自动重试时间

`completed` 表示所有 Provider 都接受了提交。它不保证邮件已经到达收件箱，也不代表用户已经阅读。`unknown` 表示提交结果无法确认，先查看 Provider 后台和目标收件箱，再决定是否重试。

## 第七步：写通知内容

通知内容通常由业务字段拼接得到，不需要额外的模板引擎：

```ts
const content = {
  title: `订单 ${approval.orderNo} 已通过`,
  body: `申请人 ${approval.requesterName} 的订单已完成审批，请查看处理结果。`,
  actionUrl: `/orders/${approval.orderId}`,
};
```

`title`、`body` 和 `actionUrl` 是所有内置 Channel 都能理解的通用字段。只有 Email 需要额外字段时，才使用 `channelOverrides`：

```ts
await notification.send({
  idempotencyKey: `approval:${approval.id}:approved:email`,
  to: { type: 'email', address: approval.requesterEmail },
  channels: ['email'],
  content,
  channelOverrides: {
    email: {
      subject: `订单 ${approval.orderNo} 已通过`,
      html: `<p>订单 ${approval.orderNo} 已通过审批。</p>`,
    },
  },
});
```

正文中不要放密码、Token、Webhook URL 或完整的敏感数据。日志会隐藏消息正文和收件人快照，业务定位信息应通过 `source.type` 和 `source.referenceId` 记录。

## 常见问题

### 审批成功了，但没有通知记录

确认审批成功路径是否真的调用了 `notificationServiceToken`，以及调用是否被条件分支提前跳过。工作流构建成功不代表通知代码已经接入真实业务事件。

### 日志显示 `pending` 或长时间 `processing`

先检查队列 Worker 是否启动、通知相关迁移是否完成，以及服务端是否记录了队列派发错误。不要因为页面没有立即更新就重复触发审批；重复执行应继续复用同一个幂等键。

### 同一个审批产生了两条通知

检查每次执行生成的 `idempotencyKey` 是否完全相同。使用当前时间或随机数会让同一个业务事件看起来像两次不同的发送。

### 状态是 `unknown`

`unknown` 代表 Provider 可能已经收到消息。先根据 Attempt 和 Provider 后台确认外部结果，再决定是否调用 `retryDelivery()`。没有 Provider 幂等保证时，重试意味着可能重复发送。

## 小结

| 目标         | 做法                                                   |
| ------------ | ------------------------------------------------------ |
| 发站内信     | 启用 `in-app` Channel，接收人使用用户 ID               |
| 发 Email     | 启用 `email` Channel，配置 SMTP 或 Resend              |
| 发飞书、钉钉 | 启用 `im` Channel，配置群机器人 Webhook                |
| 避免重复发送 | 为同一业务事件复用稳定的 `idempotencyKey`              |
| 检查投递结果 | 查看「设置 / 通知 / 通知日志」中的 Delivery 和 Attempt |

至此，审批通过后的通知闭环就接好了：业务代码负责决定什么时候发送和发给谁，通知插件负责保存、排队、投递、重试和记录结果。

## 相关链接

- [通知](../capabilities/notification.md)——通知插件的完整配置、发送和排查说明
- [工作流快速开始](../capabilities/workflow/quick-start.md)——从业务需求开始开发和验证工作流
- [Run 节点](../capabilities/workflow/development/nodes/run.md)——在工作流中执行类型化业务动作
- [应用配置](../app/configuration.md)——了解 `config.yml` 和运行时配置
