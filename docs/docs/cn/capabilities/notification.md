---
title: '通知'
description: '在 NocoBase 3 中发送站内信、邮件和即时通讯消息，并查看投递日志。'
keywords: 'NocoBase,通知,站内信,邮件,即时通讯,飞书,钉钉,服务商,Provider'
---

# 通知

NocoBase 3 的通知能力用于向用户发送站内信、邮件和即时通讯消息，并保存每次投递的状态。默认应用已经注册通知相关插件，大部分时候只需要在 `config.yml` 中开启要用的渠道，再从业务代码调用通知服务。

## 通知由哪些部分组成

通知能力由下面几个插件共同组成：

| 插件                                          | 负责什么                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@nocobase/app-plugin-notification`           | 保存通知（Notification）、投递（Delivery）和投递尝试（Attempt），处理队列、重试、日志和测试发送     |
| `@nocobase/app-plugin-notification-in-app`    | 提供站内信渠道（`in-app`），把消息保存到用户的站内信收件箱                                          |
| `@nocobase/app-plugin-notification-providers` | 提供邮件渠道（`email`）和即时通讯渠道（`im`），以及 SMTP、Resend、飞书 Webhook、钉钉 Webhook 服务商 |

其中：

- **渠道（Channel）**决定接收人如何解析，以及通知内容如何转换成渠道消息
- **服务商（Provider）**负责一次具体的外部提交，比如连接 SMTP 服务或调用群机器人 Webhook
- **通知（Notification）**表示一次业务通知
- **投递（Delivery）**表示将这条通知发送给某个接收人、某个渠道和某个服务商后形成的一条记录
- **投递尝试（Attempt）**表示一次实际的服务商调用

一条通知可能会拆成多条投递（Delivery）：

```text
通知（Notification）
├── 投递（Delivery）：user-1 / in-app / default
├── 投递（Delivery）：user-1 / email / smtp
└── 投递（Delivery）：ops / im / feishu
```

这样既能查看整条通知的结果，也能定位某一次服务商调用为什么失败。

## 默认应用已经接好通知

基于 `app-template-default` 或 `app-template-examples` 创建的应用已经注册了核心通知、站内信和内置服务商插件。默认配置只启用站内信：

```yaml
notification:
  channels:
    - type: in-app
      enabled: true
      providers:
        - type: database
          name: default
```

首次启用通知插件或新增通知相关插件后，执行应用迁移：

```bash
pnpm migrate
```

核心插件会创建通知、投递和投递尝试数据表，站内信插件会创建收件箱数据表。如果应用配置中的 `database.connections.main.migrations.autoRun` 为 `true`，应用启动时也会自动执行待处理迁移。

如果你使用的是自定义应用，需要按实际渠道注册插件：

```bash
pnpm plugin:register notification
pnpm plugin:register notification-in-app
pnpm plugin:register notification-providers
pnpm migrate
```

不需要站内信时可以不注册 `notification-in-app`；不需要邮件或即时通讯时可以不注册 `notification-providers`。不过，`config.yml` 中出现的每个渠道和服务商都必须有对应的插件定义。

## 配置通知渠道

通知配置位于应用的 `config.yml`，入口是 `notification.channels`。每个渠道可以配置一个或多个服务商，同一个渠道内的服务商 `name` 必须唯一。

服务商的 `name` 和 `type` 会写入待处理的投递。配置发布后，尤其是还有待处理或待重试投递时，不要随意修改这两个字段，否则原投递可能因为找不到原来的服务商而失败。

### 站内信

站内信使用数据库服务商，不需要外部服务凭据：

```yaml
notification:
  channels:
    - type: in-app
      enabled: true
      providers:
        - type: database
          name: default
```

站内信接收人使用用户 ID。站内信的服务端 API 会按当前登录用户隔离数据；客户端页面如果需要展示收件箱，可以调用站内信插件提供的 API，或者在应用中实现自己的页面。

### 邮件

邮件渠道（`email`）内置 SMTP 和 Resend 两种服务商。SMTP 配置示例：

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
          replyTo: reply@example.com
```

端口 `465` 通常使用 `secure: true`，端口 `587` 通常使用 `secure: false` 并通过 STARTTLS 升级连接。Gmail 等服务通常需要应用专用密码，不要填写账号登录密码。

Resend 配置示例：

```yaml
notification:
  channels:
    - type: email
      enabled: true
      providers:
        - type: resend
          name: resend
          apiKey: replace-with-the-resend-api-key
          from: NocoBase <notifications@example.com>
          replyTo: reply@example.com
```

生产环境的 `from` 应使用已经通过 Resend 验证的域名。给用户发送邮件时，如果接收人写成 `{ type: 'user', id: '...' }`，还需要在邮件渠道（`email`）中配置用户 ID 到邮箱地址的解析器（`resolver`）；直接使用 `{ type: 'email', address: '...' }` 则不需要这个解析器。

### 飞书和钉钉

即时通讯渠道（`im`）通过群机器人 Webhook 发送消息。飞书示例：

```yaml
notification:
  channels:
    - type: im
      enabled: true
      providers:
        - type: feishu-webhook
          name: feishu
          target: default
          webhookUrl: https://open.feishu.cn/open-apis/bot/v2/hook/replace-me
          secret: replace-with-the-feishu-secret
```

钉钉示例：

```yaml
notification:
  channels:
    - type: im
      enabled: true
      providers:
        - type: dingtalk-webhook
          name: dingtalk
          target: default
          webhookUrl: https://oapi.dingtalk.com/robot/send?access_token=replace-me
          secret: replace-with-the-dingtalk-secret
```

`target` 是业务使用的逻辑目标 ID。同一个逻辑目标可以配置多个服务商，发送时再决定使用其中一个，或者全部发送。飞书 Webhook 只接受 `open.feishu.cn` 和 `open.larksuite.com` 的 HTTPS 地址，钉钉 Webhook 只接受 `oapi.dingtalk.com` 的 HTTPS 地址，内置服务商会拒绝重定向。

:::warning 注意

Webhook 地址、签名密钥、SMTP 密码和 Resend API 密钥都是凭据。不要把真实值提交到 Git、写入日志或放进错误信息。应用的 `config.yml` 默认应该保持在版本控制之外，并通过运行时密钥配置注入真实值。

:::

## 从业务代码发送通知

业务服务端代码应从应用容器解析共享的 `notificationServiceToken`，再调用 `send()`。不要在业务模块中创建第二个通知管理器（Notification Manager），也不要直接调用 SMTP、Resend 或 Webhook。

下面的例子在审批通过后给申请人发送一条站内信：

```ts
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';

const notification = app.container.resolve(notificationServiceToken);

const result = await notification.send({
  // 同一次业务事件重试时必须复用同一个幂等键
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

`content` 中的 `title`、`body` 和 `actionUrl` 是通用内容。`actionUrl` 应该指向应用自己的页面，不要把未经校验的外部地址直接写入通知。

如果要发送邮件，可以直接指定邮箱地址：

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

一次调用也可以指定多个接收人和多个渠道。系统会按接收人与渠道的组合创建投递；如果还配置了 `strategy: 'all'`，则会为选中的每个服务商再分别创建投递。大部分时候省略 `routing` 就够了，系统会选择每个渠道的第一个启用服务商。

需要明确选择服务商时，只传配置中的 `name`：

```ts
await notification.send({
  idempotencyKey: `deployment:${deployment.id}:ops:feishu`,
  to: { type: 'target', id: 'default' },
  channels: ['im'],
  routing: {
    im: {
      providers: {
        provider: 'feishu',
      },
    },
  },
  content: {
    title: '部署完成',
    body: `版本 ${deployment.version} 已部署完成。`,
  },
});
```

### 幂等键一定要稳定

`idempotencyKey` 用来表示一次业务发送。相同的 `idempotencyKey` 和相同的请求会返回原来的通知，不会重复创建；相同的 `idempotencyKey` 如果对应了不同内容，则会抛出冲突错误。

因此，队列重试、请求超时后重发或服务恢复时，都要复用原来的幂等键。不要把当前时间、随机数或每次执行都会变化的投递尝试 ID 放进同一次业务发送的幂等键。

`send()` 返回的结果通常是 `pending` 或 `processing`，只表示通知已经保存并交给队列。投递状态为 `accepted` 才表示服务商接受了提交；这仍不代表最终用户已经收到或阅读。需要确认结果时，保存返回的通知 ID，再查询通知状态和投递日志。

## 测试发送和查看日志

启用客户端通知插件后，进入「设置 / 通知 / 通知日志」可以查看最近的通知、投递和投递尝试记录。

<!-- 需要一张「设置 / 通知 / 通知日志」页面的截图，展示投递记录和「发送测试通知」按钮。 -->

页面提供「发送测试通知」按钮：

- 站内信测试可以填写接收用户 ID；留空时发送给当前登录用户
- 邮件测试必须填写接收邮箱
- 即时通讯测试会发送到所选服务商配置的 `target`
- 测试发送会走正式的通知管理器（Notification Manager），并写入通知日志

日志页面需要 `page:notification.logs` 的 `access` 权限。提交测试消息时还需要 `notification:test` 的 `send` 权限。测试消息是真实的外部发送，生产环境只在确认接收范围后使用。

## 投递状态怎么看

通知的状态会汇总它下面所有投递：

| 状态         | 含义                                   |
| ------------ | -------------------------------------- |
| `pending`    | 投递已经保存，等待队列执行             |
| `processing` | 至少一条投递正在准备、提交或等待重试   |
| `completed`  | 所有投递都已经被服务商接受             |
| `partial`    | 已结束的投递中同时有成功和失败         |
| `failed`     | 所有投递都失败，且没有等待中的自动重试 |
| `unknown`    | 至少一次服务商提交结果无法确认         |

投递还可能显示 `preparing`、`submitting`、`accepted` 和 `failed`。`accepted` 表示服务商已接受提交，不等于供应商最终送达；`unknown` 表示消息可能已经发出，不要直接当成未发送处理。

遇到 `pending` 或长时间 `processing` 时，先检查队列工作进程（Worker）、应用迁移和服务端日志。`failed` 需要查看接收人、凭据、服务商配置和错误类别。`partial` 要逐条检查失败的投递，不要为了重发整条通知而再次发送所有接收人。

如果状态是 `unknown`，先到对应服务商的后台或目标群组确认提交结果，再决定是否重试。重试可能造成重复消息时，必须明确接受这个风险并填写重试原因。

## 相关链接

- [5. 发通知](../tutorials/notifications.md)——通过审批案例完成配置、发送和排查
- [工作流快速开始](./workflow/quick-start.md)——了解如何让应用智能体（Agent）接入后台业务流程
- [Run 节点](./workflow/development/nodes/run.md)——在工作流中调用应用服务（Service）和通知服务
- [应用配置](../app/configuration.md)——了解 `config.yml` 和运行时配置
