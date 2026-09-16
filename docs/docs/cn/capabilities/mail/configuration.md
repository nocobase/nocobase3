---
title: '配置邮件'
description: '配置邮件服务商、OAuth 回调、自动同步和推送同步。'
---

# 配置邮件

邮件配置位于应用 `config.yml` 的 `mail` 节点。先按[邮件概览](./index.md)注册核心和需要的服务商插件，再选择下面的配置。一个应用可以同时配置多个实例；实例名会关联到已有账户，接入后应保持稳定。

## Gmail

在 `mail.providers` 中添加 Gmail 实例：

```yaml
mail:
  providers:
    google:
      type: gmail
      clientId: replace-with-google-oauth-client-id
      clientSecret: replace-with-google-oauth-client-secret
```

使用 Google OAuth Web 应用的凭据，并为该应用登记下文说明的完整 OAuth 回调地址。插件默认请求 `https://www.googleapis.com/auth/gmail.modify` 和 `https://www.googleapis.com/auth/gmail.settings.basic`，分别用于邮件操作和发件地址发现。可通过实例的 `scopes` 配置允许请求的授权范围；账户关联请求不能超出该列表。

## Microsoft 365

```yaml
mail:
  providers:
    microsoft-365:
      type: microsoft
      tenant: common
      clientId: replace-with-microsoft-entra-client-id
      clientSecret: replace-with-microsoft-entra-client-secret
```

填写 Microsoft Entra 应用凭据并登记完整 OAuth 回调地址。`tenant` 默认是 `common`，也可以指定租户 ID 或域名。插件默认请求 `openid`、`profile`、`email`、`offline_access`，以及 Microsoft Graph 的 `User.Read`、`Mail.ReadWrite`、`Mail.Send`，可通过 `scopes` 调整允许请求的范围。

## IMAP/SMTP

```yaml
mail:
  providers:
    company-mail:
      type: imap-smtp
      imap:
        host: imap.example.com
        port: 993
        secure: true
      smtp:
        host: smtp.example.com
        port: 465
        secure: true
```

应用配置收信和发信服务器，用户关联账户时填写邮箱地址、用户名和密码。插件会验证两个端点后再保存凭据。邮箱服务要求使用授权码或应用专用密码时，填写该值。

`host`、`port` 和 `secure` 均为必填项。`secure: true` 表示连接时直接使用 TLS；上例适用于 IMAP `993` 和 SMTP `465`。SMTP 使用 STARTTLS 端口时按服务器要求设置 `secure: false`。证书校验 `rejectUnauthorized` 默认是 `true`。实例还可以设置 `sentFolder`、`trashFolder`、`draftsFolder`，作为文件夹自动识别的路径提示；这些提示不会启用远端草稿功能。

所有服务商实例的 `enabled` 默认是 `true`。设置为 `false` 后，关联到该实例的已有账户也不能继续使用它。

## OAuth 回调地址

`mail.oauthCallbackUrl` 默认是应用内路径 `/mail/oauth/callback`。邮件插件将应用的 `app.publicBasePath` 加到路径前面，再根据 `app.publicOrigin` 生成完整地址；没有配置公共 origin 时使用请求 origin。

例如，公共 origin 是 `https://mail.example.com`、应用挂载在 `/main`，应在 OAuth 应用中登记：

```text
https://mail.example.com/main/mail/oauth/callback
```

可通过 `mail.oauthCallbackUrl` 或 `MAIL_OAUTH_CALLBACK_URL` 覆盖。相对路径仍会加上应用前缀；绝对地址必须已经包含该前缀，且最终转发到当前应用。地址不能包含 `#` 片段。

```yaml
mail:
  oauthCallbackUrl: /mail/oauth/callback
```

本地开发时，确认登记的主机名、端口和实际访问地址一致。需要固定地址时可显式设置 `APP_PUBLIC_ORIGIN`，使用启动日志中的实际端口。OAuth 回调与推送回调是两种不同地址，不可相互替代。

## 同步配置

| 配置项                         | 默认值   | 环境变量                          | 含义                                                                       |
| ------------------------------ | -------- | --------------------------------- | -------------------------------------------------------------------------- |
| `mail.automaticSyncIntervalMs` | `300000` | `MAIL_AUTOMATIC_SYNC_INTERVAL_MS` | 所有账户统一使用的自动同步间隔，仅通过 config 配置，单位毫秒，至少 `60000` |
| `mail.syncBatchSize`           | `100`    | `MAIL_SYNC_BATCH_SIZE`            | 每次服务商同步请求的批量大小，整数 `1–200`                                 |

每个账户可以单独保存同步间隔，在开发环境的 `/dev/mail/accounts` 账户表格中按分钟调整，最小为 1 分钟。运行时每分钟检查到期账户；全局配置作为新账户的默认值，不会统一改写已有账户的间隔。

首次关联账户时可以选择历史邮件的起始日期。通过 API 发起首次同步时，`receivedAfter` 和 `maxMessages` 同时生效：默认最多导入 10,000 封历史邮件，`maxMessages` 允许设置为 `1–100000`。服务商返回的单页可能略超请求数量，最终历史导入数量也可能略超上限。历史导入完成后，还会补齐导入期间发生的变更；该上限不是账户今后可以保存的邮件总量。

## 推送同步

推送可让 Gmail 和 Microsoft 365 的邮箱变更更快触发增量同步。先同时配置公共回调地址和密钥：

```yaml
mail:
  pushWebhookUrl: https://mail.example.com/main/mail/webhooks
  pushWebhookSecret: replace-with-a-random-secret-at-least-32-characters
```

将示例密钥替换为随机值：长度为 `32–128`，仅使用字母、数字、`_` 和 `-`。对应环境变量为 `MAIL_PUSH_WEBHOOK_URL`、`MAIL_PUSH_WEBHOOK_SECRET`，只填写其中一项不会启用推送。运行时在基础地址后追加服务商类型、实例名和密钥，例如：

```text
https://mail.example.com/main/mail/webhooks/gmail/google/<secret>
```

Gmail 还需要在 `google` 实例中设置 `pushTopicName: projects/example/topics/mail-push`，并在 Google Cloud Pub/Sub 中把推送订阅指向上面的完整地址。主题需要允许 Gmail 推送服务账号发布消息；可用 `pushLabelIds` 限制监听标签。邮件插件负责创建和续期账户的 Gmail watch。

Microsoft 365 的订阅由邮件插件在账户连接后创建、验证和续期，无需手动在 Graph 或 Entra 中登记 webhook。配置的地址需要能够从公网通过 HTTPS 访问。

推送只触发已有的增量同步流程，周期同步仍然作为通知延迟或丢失时的补充。IMAP/SMTP 不支持推送。

## 配置与凭据存储

上面列出的 `MAIL_*` 环境变量会覆盖对应的 `mail` 配置。服务商凭据、端点和授权范围通过 `mail.providers` 设置，没有独立的 `MAIL_*` 环境变量映射。修改配置后重启应用。

不要将真实的 OAuth 密钥、推送密钥和邮箱密码提交到仓库。当前核心插件的默认凭据存储将授权数据以普通 JSON 保存在数据库中；如应用要求加密保存，应让 Coding Agent 在邮件核心注册前接入 `mailCredentialVaultToken` 的替代实现。

配置完成后，继续[关联账户并使用邮件](./usage.md)。
