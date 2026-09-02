---
title: '配置通知 Provider'
description: '配置 NocoBase SMTP、Resend、飞书和钉钉通知 Provider，并验证连接参数。'
keywords: 'NocoBase,通知配置,SMTP,Resend,飞书,钉钉,Webhook,Provider'
---

# 配置通知 Provider

在 NocoBase 中，`@nocobase/app-plugin-notification-providers` 不会直接读取环境变量。应用通过 `config.yml` 中的 `notification.channels` 声明 Channel 和 Provider，再由 `NotificationManager` 创建对应的运行时实例。默认模板的 `config.example.yml` 已启用站内信，并提供 SMTP、Resend、飞书和钉钉的注释示例。

## 默认模板的最小配置

复制示例配置后，按需取消对应 Channel 和 Provider 的注释：

```bash
cp packages/templates/app-template-default/config.example.yml \
  packages/templates/app-template-default/config.yml
```

SMTP、Resend、飞书和钉钉可以独立启用；SMTP 和 Resend 也可以同时放在同一个 Email Channel 中。未写入 `notification.channels` 的外部 Provider 不会启用。

可以先检查解析后的配置。输出只包含 Provider 名称、类型、启用状态以及测试收件人是否已配置，不会显示密码、API Key、Webhook 或收件地址：

```bash
pnpm --filter @nocobase/app-template-default server:config
```

## 配置 SMTP

SMTP 适合 Gmail、企业邮箱或自建邮件服务器：

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
            pass: replace-with-an-app-password
          from: NocoBase <mailer@example.com>
          replyTo: reply@example.com
```

其中：

| 配置项    | 必填 | 说明                                                                |
| --------- | ---- | ------------------------------------------------------------------- |
| `host`    | 是   | SMTP 服务器主机名                                                   |
| `port`    | 是   | 端口 `465` 通常配合 `secure: true`；端口 `587` 通常连接后再升级 TLS |
| `secure`  | 否   | 是否在建立连接时直接使用 TLS                                        |
| `auth`    | 否   | SMTP 认证用户名和密码；`user`、`pass` 应同时填写                    |
| `from`    | 否   | 默认发件人，需要符合邮件供应商的发件人规则                          |
| `replyTo` | 否   | 回复地址                                                            |

### Gmail

Gmail 支持 SMTP。通常来说可以使用下面的配置：

```yaml
host: smtp.gmail.com
port: 465
secure: true
auth:
  user: your-account@gmail.com
  pass: your-16-character-app-password
from: your-account@gmail.com
```

这里的 `auth.pass` 不是 Google 账号登录密码。你需要先开启两步验证，再到 Google 账号的「安全性」→「应用专用密码」生成密码。生成后只显示一次，无法再次查看；如果丢失，需要撤销旧密码并重新生成。部分组织账号会由管理员禁用应用专用密码。

## 配置 Resend

先在 Resend 控制台创建 API Key。生产环境还需要验证自己的发件域名，并让 `from` 使用该域名下的地址：

```yaml
notification:
  channels:
    - type: email
      enabled: true
      providers:
        - type: resend
          name: resend
          apiKey: re_xxxxxxxxx
          from: NocoBase <notifications@example.com>
          replyTo: reply@example.com
```

| 配置项    | 必填 | 说明                                                               |
| --------- | ---- | ------------------------------------------------------------------ |
| `apiKey`  | 是   | Resend 控制台创建的 API Key                                        |
| `from`    | 是   | 已验证域名下的发件人；测试阶段可以按 Resend 控制台提示使用测试地址 |
| `replyTo` | 否   | 回复地址                                                           |

## 配置飞书群机器人

在目标飞书群中打开「设置」→「群机器人」→「添加机器人」→「自定义机器人」。创建后复制 Webhook 地址。如果启用了「签名校验」，再复制签名密钥：

```yaml
notification:
  channels:
    - type: im
      enabled: true
      providers:
        - type: feishu-webhook
          name: feishu
          target: default
          webhookUrl: https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx
          secret: xxxxxxxx
```

`secret` 只有在机器人启用签名校验时才需要填写。Provider 只接受 `open.feishu.cn` 和 `open.larksuite.com` 的 HTTPS Webhook，并拒绝重定向。

## 配置钉钉群机器人

在目标钉钉群中打开「群设置」→「机器人」→「添加机器人」→「自定义」。安全设置选择「加签」，完成后复制 Webhook 地址和以 `SEC` 开头的密钥：

```yaml
notification:
  channels:
    - type: im
      enabled: true
      providers:
        - type: dingtalk-webhook
          name: dingtalk
          target: default
          webhookUrl: https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxx
          secret: SECxxxxxxxx
```

如果机器人没有启用「加签」，可以省略 `secret`。Provider 只接受 `oapi.dingtalk.com` 的 HTTPS Webhook，并拒绝重定向。

:::warning 注意

Webhook URL 自身包含访问凭据。不要提交包含真实凭据的 `config.yml`，也不要把 Webhook URL、签名密钥、SMTP 密码或 Resend API Key 写入日志。模板已默认忽略 `config.yml`。

:::

## 发送测试消息

核心通知插件的日志设置页会根据受保护的 targets API 动态显示测试按钮和表单。目标列表只包含已注册定义与已启用配置实例的交集，不会返回 Webhook URL、API Key、密码或签名密钥。

测试 Email 时必须填写接收邮箱；IM 测试会发送到所选 Provider 配置的逻辑目标。页面要求用户已登录、拥有 `notification:test` 的 `send` 权限，并且必须在 `config.yml` 中显式启用：

```yaml
notification:
  test:
    enabled: true
```

核心接口为 `GET /api/notifications/test/targets`、`POST /api/notifications/test/send` 和 `GET /api/notifications/test/:id/status`。它们都要求 `x-nocobase-notification-test: 1` 防跨站请求头；状态只对发起该测试的用户可见。所有测试都走正式的 `NotificationManager.send()` 路径，并创建 Notification、Delivery 和 Attempt 日志。只应在受控环境中临时启用；生产环境验证完成后应及时关闭。

## 手动构造配置

不使用默认模板时，可以通过配置 helper 构造相同的 Channel 配置：

```ts
import {
  defineEmailChannelConfig,
  defineResendProviderConfig,
  defineSmtpProviderConfig,
} from '@nocobase/app-plugin-notification-providers';
import {
  defineDingTalkWebhookProviderConfig,
  defineFeishuWebhookProviderConfig,
  defineImChannelConfig,
} from '@nocobase/app-plugin-notification-providers/im';
import type { NotificationConfig } from '@nocobase/app-plugin-notification';

export const notificationConfig: NotificationConfig = {
  channels: [
    defineEmailChannelConfig({
      enabled: true,
      providers: [
        defineSmtpProviderConfig({
          name: 'smtp',
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: { user: 'mailer@example.com', pass: 'app-password' },
          from: 'NocoBase <mailer@example.com>',
        }),
        defineResendProviderConfig({
          name: 'resend',
          apiKey: 're_xxxxxxxxx',
          from: 'NocoBase <notifications@example.com>',
        }),
      ],
    }),
    defineImChannelConfig({
      enabled: true,
      providers: [
        defineFeishuWebhookProviderConfig({
          name: 'feishu',
          target: 'ops-alerts',
          webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx',
          secret: 'xxxxxxxx',
        }),
        defineDingTalkWebhookProviderConfig({
          name: 'dingtalk',
          target: 'ops-alerts',
          webhookUrl:
            'https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxx',
          secret: 'SECxxxxxxxx',
        }),
      ],
    }),
  ],
};
```

同一个逻辑接收目标的 Provider 使用相同的 `target`，比如上面的 `ops-alerts`。省略 `target` 时默认为 `default`。同一个 Channel 内的 Provider `name` 必须唯一，发送时通过这个名称选择 Provider，不需要再传 `type`。Provider 的 `name` 和 `type` 都会写入 Delivery，配置发布和应用重启后应保持两者稳定。完整的路由写法见[发送通知](../../../app-plugin-notification/docs/zh-CN/sending.md)，definitions 注册和生命周期接入见[手动接入通知](../../../app-plugin-notification/docs/zh-CN/integration.md)。

## 相关链接

- [通知概览](../../../app-plugin-notification/docs/zh-CN/overview.md) — 了解 Notification、Delivery 和 Attempt
- [手动接入通知](../../../app-plugin-notification/docs/zh-CN/integration.md) — 注册 Channel 与 Provider definitions
- [发送通知](../../../app-plugin-notification/docs/zh-CN/sending.md) — 从业务代码发送 Email 和 IM 消息
- [通知日志](../../../app-plugin-notification/docs/zh-CN/logs.md) — 查询 Delivery 和 Attempt
- [Google 应用专用密码](https://support.google.com/accounts/answer/185833) — 创建和管理 Gmail SMTP 使用的应用专用密码
- [Resend Domains](https://resend.com/docs/dashboard/domains/introduction) — 配置发件域名
