---
title: '配置通知 Provider'
description: '配置 NocoBase 站内信、SMTP、Resend、飞书和钉钉通知 Provider，并验证连接参数。'
keywords: 'NocoBase,通知配置,SMTP,Resend,飞书,钉钉,Webhook,Provider'
---

# 配置通知 Provider

通知包不会直接读取固定的环境变量。应用需要从环境变量、配置文件或其他配置源构造 `NotificationConfig`，再交给 `NotificationManager`。默认模板已经提供一套最小环境变量配置，可以直接用于 SMTP、Resend、飞书和钉钉。

## 默认模板的最小配置

先在 `packages/app-template-default/.env.local` 中选择每个 Channel 使用的 Provider：

```dotenv
NOTIFICATION_EMAIL_PROVIDER=smtp
NOTIFICATION_IM_PROVIDER=feishu
```

两个选择器都是可选的。留空时，对应 Channel 不会启用。每个 Channel 一次只选择一个 Provider；如果要切换供应商，先处理完队列中尚未结束的 Delivery，再修改选择器并重启应用。

可以先检查解析后的配置。输出只包含 Provider 名称、类型、启用状态以及测试收件人是否已配置，不会显示密码、API Key、Webhook 或收件地址：

```bash
pnpm --filter @nocobase/app-template-default server:config
```

## 配置 SMTP

SMTP 适合 Gmail、企业邮箱或自建邮件服务器。默认模板使用以下变量：

```dotenv
NOTIFICATION_EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mailer@example.com
SMTP_PASSWORD=replace-with-an-app-password
SMTP_FROM=NocoBase <mailer@example.com>
SMTP_REPLY_TO=reply@example.com
TEST_EMAIL_RECIPIENT=recipient@example.com
```

其中：

| 配置项                 | 必填       | 说明                                                                  |
| ---------------------- | ---------- | --------------------------------------------------------------------- |
| `SMTP_HOST`            | 是         | SMTP 服务器主机名                                                     |
| `SMTP_PORT`            | 否         | 默认值为 `587`                                                        |
| `SMTP_SECURE`          | 否         | 端口 `465` 通常为 `true`；端口 `587` 通常为 `false`，连接后再升级 TLS |
| `SMTP_USER`            | 否         | SMTP 认证用户名；与 `SMTP_PASSWORD` 同时填写或同时省略                |
| `SMTP_PASSWORD`        | 否         | SMTP 密码或应用专用密码                                               |
| `SMTP_FROM`            | 是         | 默认发件人，需要符合邮件供应商的发件人规则                            |
| `SMTP_REPLY_TO`        | 否         | 回复地址                                                              |
| `TEST_EMAIL_RECIPIENT` | 仅测试必填 | 测试页面和 `notification:test` 的固定收件地址                         |

### Gmail

Gmail 支持 SMTP。通常来说可以使用下面的配置：

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-account@gmail.com
SMTP_PASSWORD=your-16-character-app-password
SMTP_FROM=your-account@gmail.com
```

这里的 `SMTP_PASSWORD` 不是 Google 账号登录密码。你需要先开启两步验证，再到 Google 账号的「安全性」→「应用专用密码」生成密码。生成后只显示一次，无法再次查看；如果丢失，需要撤销旧密码并重新生成。部分组织账号会由管理员禁用应用专用密码。

## 配置 Resend

先在 Resend 控制台创建 API Key。生产环境还需要验证自己的发件域名，并让 `RESEND_FROM` 使用该域名下的地址：

```dotenv
NOTIFICATION_EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM=NocoBase <notifications@example.com>
RESEND_REPLY_TO=reply@example.com
TEST_EMAIL_RECIPIENT=recipient@example.com
```

| 配置项                 | 必填       | 说明                                                               |
| ---------------------- | ---------- | ------------------------------------------------------------------ |
| `RESEND_API_KEY`       | 是         | Resend 控制台创建的 API Key                                        |
| `RESEND_FROM`          | 是         | 已验证域名下的发件人；测试阶段可以按 Resend 控制台提示使用测试地址 |
| `RESEND_REPLY_TO`      | 否         | 回复地址                                                           |
| `TEST_EMAIL_RECIPIENT` | 仅测试必填 | 测试页面和 `notification:test` 的固定收件地址                      |

## 配置飞书群机器人

在目标飞书群中打开「设置」→「群机器人」→「添加机器人」→「自定义机器人」。创建后复制 Webhook 地址。如果启用了「签名校验」，再复制签名密钥：

```dotenv
NOTIFICATION_IM_PROVIDER=feishu
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx
FEISHU_WEBHOOK_SECRET=xxxxxxxx
```

`FEISHU_WEBHOOK_SECRET` 只有在机器人启用签名校验时才需要填写。Provider 只接受 `open.feishu.cn` 和 `open.larksuite.com` 的 HTTPS Webhook，并拒绝重定向。

## 配置钉钉群机器人

在目标钉钉群中打开「群设置」→「机器人」→「添加机器人」→「自定义」。安全设置选择「加签」，完成后复制 Webhook 地址和以 `SEC` 开头的密钥：

```dotenv
NOTIFICATION_IM_PROVIDER=dingtalk
DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxx
DINGTALK_WEBHOOK_SECRET=SECxxxxxxxx
```

如果机器人没有启用「加签」，可以省略 `DINGTALK_WEBHOOK_SECRET`。Provider 只接受 `oapi.dingtalk.com` 的 HTTPS Webhook，并拒绝重定向。

:::warning 注意

Webhook URL 自身包含访问凭据。不要把 `.env.local`、Webhook URL、签名密钥、SMTP 密码或 Resend API Key 提交到 Git，也不要写入日志。

:::

## 使用测试页面发送消息

启动应用并登录后，打开：

```text
http://localhost:13000/main/api/notification-providers/test
```

如果修改了 `APP_BASE_PATH`，请把 `/main` 替换成实际路径。页面会列出当前启用的 Email 和 IM Provider，点击按钮后通过正式的 `NotificationManager` 发送消息，并展示 Notification 和 Delivery 状态。因此测试过程会创建 Notification、Delivery 和 Attempt 日志。

Email 测试只会发到 `TEST_EMAIL_RECIPIENT`，页面不允许临时输入其他收件人；IM 测试会发送到所配置 Webhook 对应的群。页面要求用户已登录。非生产环境默认启用；`NODE_ENV=production` 时默认关闭，也可以显式控制：

```dotenv
NOTIFICATION_PROVIDER_TEST_ENABLED=true
```

只应在受控的生产环境中临时启用，验证完成后及时关闭。

## 使用命令发送烟测消息

默认模板还提供独立的 Provider 烟测命令。它直接调用所选传输，不创建 Notification、Delivery 或 Attempt，适合在应用尚未启动时确认第三方凭据是否可用：

```bash
pnpm --filter @nocobase/app-template-default notification:test smtp
pnpm --filter @nocobase/app-template-default notification:test resend
pnpm --filter @nocobase/app-template-default notification:test feishu
pnpm --filter @nocobase/app-template-default notification:test dingtalk
```

Email 烟测会把邮件发到 `TEST_EMAIL_RECIPIENT`。飞书和钉钉烟测会直接向 Webhook 所属群发送一条文本消息。命令返回 `accepted` 表示供应商接受了请求，不过不等于最终用户已经阅读。

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
          webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx',
          secret: 'xxxxxxxx',
        }),
        defineDingTalkWebhookProviderConfig({
          name: 'dingtalk',
          webhookUrl:
            'https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxx',
          secret: 'SECxxxxxxxx',
        }),
      ],
    }),
  ],
};
```

Provider 的 `name` 和 `type` 会写入 Delivery。配置发布和应用重启后应保持两者稳定。完整的 definitions 注册和生命周期接入见[手动接入通知](./integration.md)。

## 相关链接

- [通知概览](./overview.md) — 了解 Notification、Delivery 和 Attempt
- [手动接入通知](./integration.md) — 注册 Channel 与 Provider definitions
- [发送通知](./sending.md) — 从业务代码发送 Email 和 IM 消息
- [通知日志](./logs.md) — 查询 Delivery 和 Attempt
- [Google 应用专用密码](https://support.google.com/accounts/answer/185833) — 创建和管理 Gmail SMTP 使用的应用专用密码
- [Resend Domains](https://resend.com/docs/dashboard/domains/introduction) — 配置发件域名
