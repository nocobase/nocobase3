---
title: '配置邮件插件'
description: '整理 NocoBase v3 邮件插件 Mail Core、Gmail、Microsoft 365 和 IMAP / SMTP Provider 的配置项。'
keywords: 'NocoBase,邮件配置,邮箱,Gmail,Microsoft 365,IMAP,SMTP,OAuth,Push'
---

# 配置邮件插件

在 NocoBase 中，邮件插件的服务端配置放在 `config.yml` 的 `mail` 节点。大部分场景只需要配置 Provider 的必填参数；自动同步、OAuth callback 和 Push 通知按需配置即可。

邮件插件由 Mail Core 和 Provider 插件组成：

- `@nocobase/app-plugin-mail`——账户生命周期、OAuth callback、同步、发送和邮件中心
- `@nocobase/app-plugin-mail-provider-gmail`——Gmail OAuth、Gmail API 和 Gmail Push
- `@nocobase/app-plugin-mail-provider-microsoft`——Microsoft 365 OAuth、Graph API 和 Graph Push
- `@nocobase/app-plugin-mail-provider-imap-smtp`——标准 IMAP / SMTP 账户接入

使用某个 Provider 前，需要在应用中启用对应的 Server Provider 插件，并在 `mail.providers` 中添加同类型配置。

:::warning 注意

`clientSecret`、`pushWebhookSecret`、IMAP / SMTP 密码等内容属于敏感信息。不要把真实凭据提交到代码仓库，也不要把它们写入日志。默认模板会忽略本地 `config.yml`，生产环境应该使用安全的配置注入方式。

:::

## 最小配置

下面的配置可以启用一个 Gmail OAuth Provider。`google` 是 Provider 实例名，可以按部署场景改成其他稳定名称：

```yaml
mail:
  providers:
    google:
      type: gmail
      clientId: replace-with-google-oauth-client-id
      clientSecret: replace-with-google-oauth-client-secret
```

Provider 实例名会出现在邮件账户关联界面中。`enabled` 省略时视为启用，设置为 `false` 后，已有账户也不能继续使用该 Provider。

## Mail Core 配置

Mail Core 的配置直接写在 `mail` 下。环境变量只覆盖下表中明确列出的配置项：

| 配置项                         | 类型      | 默认值                 | 环境变量                          | 说明                                                                            |
| ------------------------------ | --------- | ---------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `mail.oauthCallbackUrl`        | `string`  | `/mail/oauth/callback` | `MAIL_OAUTH_CALLBACK_URL`         | OAuth callback 的应用内路径，或完整的 `http(s)` URL。                           |
| `mail.automaticSyncIntervalMs` | `integer` | `300000`（5 分钟）     | `MAIL_AUTOMATIC_SYNC_INTERVAL_MS` | 自动同步间隔，最小值为 `60000`（1 分钟）。                                      |
| `mail.syncBatchSize`           | `integer` | `100`                  | `MAIL_SYNC_BATCH_SIZE`            | 每次 Provider 同步请求的邮件数量，范围为 `1–200`。                              |
| `mail.pushWebhookUrl`          | `string`  | 无                     | `MAIL_PUSH_WEBHOOK_URL`           | Push callback 的公共地址，应该以 `/mail/webhooks` 结尾。                        |
| `mail.pushWebhookSecret`       | `string`  | 无                     | `MAIL_PUSH_WEBHOOK_SECRET`        | Push callback 使用的共享密钥，长度为 `32–128`，只能使用字母、数字、`_` 和 `-`。 |
| `mail.providers`               | `object`  | `{}`                   | 无                                | 按实例名组织的 Provider 配置。具体字段见下文。                                  |

配置示例：

```yaml
mail:
  oauthCallbackUrl: /mail/oauth/callback
  automaticSyncIntervalMs: 300000
  syncBatchSize: 100
  pushWebhookUrl: https://mail.example.com/main/mail/webhooks
  pushWebhookSecret: replace-with-a-random-secret-at-least-32-characters
  providers:
    google:
      type: gmail
      clientId: replace-with-google-oauth-client-id
      clientSecret: replace-with-google-oauth-client-secret
```

### 首次同步的时间范围和数量

首次同步时，起始日期和最大消息数同时生效。起始日期用于筛选历史邮件，`maxMessages` 用于限制历史同步阶段导入的数量；如果达到数量上限，或者 Provider 没有更多符合日期条件的邮件，历史同步就会结束。未传 `maxMessages` 时默认值为 10,000，API 可设置为 1–100,000。Provider 返回的单页可能略超请求数量，因此最终导入数量可能略高于配置值；历史同步结束后，系统还会从基线游标执行追赶同步，补齐期间发生的变更。

`mail.automaticSyncIntervalMs` 只控制自动同步的触发间隔，不限制单次同步的执行时长。

### OAuth callback 地址

默认值是应用内路径 `/mail/oauth/callback`。Mail Core 会把它拼接到应用的 `publicBasePath` 下，再使用 `app.publicOrigin` 生成 Provider 需要的完整地址。如果没有配置 `app.publicOrigin`，发起 OAuth 的请求地址会作为 origin。

比如应用公共地址是 `https://mail.example.com`，应用挂载在 `/main`，默认完整地址就是：

```text
https://mail.example.com/main/mail/oauth/callback
```

`main` 来自应用的 `app.publicBasePath` 默认值 `/main`。它不是邮件插件的固定路径。

本地开发时，如果模板的 `pnpm dev` 将 `APP_PUBLIC_ORIGIN` 填成了
`127.0.0.1`，而浏览器使用同端口的 `localhost` 访问，Mail Core 会自动采用请求中的
`localhost`，避免 Microsoft Entra 因回调地址主机名不同而拒绝请求。

如果浏览器通过其他端口或反向代理访问，或者希望本地 OAuth 地址完全固定，显式设置
`APP_PUBLIC_ORIGIN`：

```bash
APP_PUBLIC_ORIGIN=http://localhost:13000 pnpm dev
```

其中端口需要和应用服务实际端口一致。如果开发脚本因为端口占用自动选择了其他端口，请使用启动日志中的端口，或者同时固定 `APP_SERVER_PORT`。

自定义相对路径时，填写应用内路径：

```yaml
mail:
  oauthCallbackUrl: /oauth/callback
```

上面的配置在同一应用下会生成 `https://mail.example.com/main/oauth/callback`。如果配置完整的绝对地址，该地址的路径必须包含当前应用的 `publicBasePath`：

```yaml
mail:
  oauthCallbackUrl: https://mail.example.com/main/oauth/callback
```

绝对地址可以使用反向代理提供的域名，但该域名必须最终把请求转发到当前应用。Google Cloud Console 或 Microsoft Entra 中应该登记最终生成的完整地址，并且字符完全一致。callback 地址不能包含 URL fragment（`#...`）。

### Push 通知

Push 通知需要同时配置 Mail Core 的公共地址和共享密钥：

```yaml
mail:
  pushWebhookUrl: https://mail.example.com/main/mail/webhooks
  pushWebhookSecret: replace-with-a-random-secret-at-least-32-characters
```

运行时会在这个地址后追加 Provider 类型、Provider 实例名和共享密钥。比如 Gmail 实例名是 `google`，最终 callback 地址类似于：

```text
https://mail.example.com/main/mail/webhooks/gmail/google/<secret>
```

只配置其中一项不会启用 Push。Push 通知可能延迟或丢失，自动同步仍然会作为兜底机制运行。

## Provider 配置

`mail.providers` 是一个以实例名为 key 的对象。每个实例至少需要 `type`，并且需要安装对应的 Provider 插件：

```yaml
mail:
  providers:
    google:
      type: gmail
    microsoft-365:
      type: microsoft
    company-mail:
      type: imap-smtp
```

同一个应用可以同时配置多个 Provider 实例。实例名应该保持稳定；已经连接账户后，不要随意修改对应实例名。

### Gmail

Gmail Provider 的完整配置示例：

```yaml
mail:
  providers:
    google:
      type: gmail
      enabled: true
      clientId: replace-with-google-oauth-client-id
      clientSecret: replace-with-google-oauth-client-secret
      # scopes:
      #   - https://www.googleapis.com/auth/gmail.modify
      #   - https://www.googleapis.com/auth/gmail.settings.basic
      # authorizationEndpoint: https://accounts.google.com/o/oauth2/v2/auth
      # tokenEndpoint: https://oauth2.googleapis.com/token
      # apiBaseUrl: https://gmail.googleapis.com/gmail/v1
      # pushTopicName: projects/example/topics/mail-push
      # pushLabelIds:
      #   - INBOX
```

| 配置项                  | 必填 | 默认值                                         | 说明                                                                       |
| ----------------------- | ---- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `type`                  | 是   | `gmail`                                        | Provider 类型。                                                            |
| `enabled`               | 否   | `true`                                         | 是否允许使用该 Provider。省略时视为启用。                                  |
| `clientId`              | 是   | 无                                             | Google OAuth Web 应用的 client ID。                                        |
| `clientSecret`          | 是   | 无                                             | Google OAuth Web 应用的 client secret。                                    |
| `scopes`                | 否   | `gmail.modify`、`gmail.settings.basic`         | 允许请求的 OAuth scopes。账户关联时传入的 scopes 不能超出这里的列表。      |
| `authorizationEndpoint` | 否   | `https://accounts.google.com/o/oauth2/v2/auth` | OAuth 授权地址。                                                           |
| `tokenEndpoint`         | 否   | `https://oauth2.googleapis.com/token`          | OAuth token 地址。                                                         |
| `apiBaseUrl`            | 否   | `https://gmail.googleapis.com/gmail/v1`        | Gmail API 地址。                                                           |
| `pushTopicName`         | 否   | 无                                             | Google Cloud Pub/Sub topic 的完整名称。配置后才会为 Gmail 账户创建 watch。 |
| `pushLabelIds`          | 否   | 无                                             | 限制 Gmail watch 监听的 label ID。省略时按 Gmail 默认范围监听。            |

Gmail Push 还需要配置 Mail Core 的 `pushWebhookUrl` 和 `pushWebhookSecret`，并确保 Pub/Sub topic 允许 Gmail Push 服务账号发布消息。

### Microsoft 365

Microsoft 365 Provider 的完整配置示例：

```yaml
mail:
  providers:
    microsoft-365:
      type: microsoft
      enabled: true
      tenant: common
      clientId: replace-with-microsoft-entra-client-id
      clientSecret: replace-with-microsoft-entra-client-secret
      # scopes:
      #   - openid
      #   - profile
      #   - email
      #   - offline_access
      #   - https://graph.microsoft.com/User.Read
      #   - https://graph.microsoft.com/Mail.ReadWrite
      #   - https://graph.microsoft.com/Mail.Send
      # authorityBaseUrl: https://login.microsoftonline.com
      # graphBaseUrl: https://graph.microsoft.com/v1.0
```

| 配置项             | 必填 | 默认值                                                                                     | 说明                                                                  |
| ------------------ | ---- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `type`             | 是   | `microsoft`                                                                                | Provider 类型。                                                       |
| `enabled`          | 否   | `true`                                                                                     | 是否允许使用该 Provider。省略时视为启用。                             |
| `clientId`         | 是   | 无                                                                                         | Microsoft Entra 应用的 client ID。                                    |
| `clientSecret`     | 是   | 无                                                                                         | Microsoft Entra 应用的 client secret。                                |
| `tenant`           | 否   | `common`                                                                                   | Microsoft identity tenant，可以填写 tenant ID、域名或 `common`。      |
| `scopes`           | 否   | `openid`、`profile`、`email`、`offline_access`、`User.Read`、`Mail.ReadWrite`、`Mail.Send` | 允许请求的 OAuth scopes。账户关联时传入的 scopes 不能超出这里的列表。 |
| `authorityBaseUrl` | 否   | `https://login.microsoftonline.com`                                                        | Microsoft identity authority 的基础地址。                             |
| `graphBaseUrl`     | 否   | `https://graph.microsoft.com/v1.0`                                                         | Microsoft Graph API 的基础地址。                                      |

Microsoft Graph Push 还需要配置 Mail Core 的 `pushWebhookUrl` 和 `pushWebhookSecret`。Graph subscription 由 Mail Core 创建和续期。

### IMAP / SMTP

IMAP / SMTP Provider 需要分别配置收信和发信 endpoint。用户在邮件账户页面输入邮箱地址、用户名和密码；这些凭据不会写入 `config.yml`：

```yaml
mail:
  providers:
    company-mail:
      type: imap-smtp
      enabled: true
      imap:
        host: imap.example.com
        port: 993
        secure: true
        # rejectUnauthorized: true
      smtp:
        host: smtp.example.com
        port: 465
        secure: true
        # rejectUnauthorized: true
      # sentFolder: Sent
      # trashFolder: Trash
      # draftsFolder: Drafts
```

Endpoint 字段对 `imap` 和 `smtp` 都适用：

| 配置项               | 必填 | 默认值 | 说明                                                                            |
| -------------------- | ---- | ------ | ------------------------------------------------------------------------------- |
| `host`               | 是   | 无     | 服务器主机名。                                                                  |
| `port`               | 是   | 无     | 端口，范围为 `1–65535`。常见 IMAP TLS 端口是 `993`，SMTP TLS 端口是 `465`。     |
| `secure`             | 是   | 无     | 是否在建立连接时直接使用 TLS。使用 `587` 等 STARTTLS 端口时通常设置为 `false`。 |
| `rejectUnauthorized` | 否   | `true` | 是否校验证书。自签名证书只建议在受控测试环境中临时设置为 `false`。              |

Provider 级别的文件夹配置：

| 配置项         | 必填 | 默认值   | 说明                         |
| -------------- | ---- | -------- | ---------------------------- |
| `sentFolder`   | 否   | 自动识别 | IMAP Sent 文件夹路径提示。   |
| `trashFolder`  | 否   | 自动识别 | IMAP Trash 文件夹路径提示。  |
| `draftsFolder` | 否   | 自动识别 | IMAP Drafts 文件夹路径提示。 |

IMAP / SMTP MVP 不支持 Push、Provider-native label、草稿、别名和移动到文件夹。`pushWebhookUrl` 和 `pushWebhookSecret` 对这个 Provider 不生效。

## 环境变量

Mail Core 提供以下环境变量映射：

```bash
MAIL_OAUTH_CALLBACK_URL=/main/mail/oauth/callback
MAIL_AUTOMATIC_SYNC_INTERVAL_MS=300000
MAIL_SYNC_BATCH_SIZE=100
MAIL_PUSH_WEBHOOK_URL=https://mail.example.com/main/mail/webhooks
MAIL_PUSH_WEBHOOK_SECRET=replace-with-a-random-secret-at-least-32-characters
```

Provider 的 `clientId`、`clientSecret`、endpoint 和 OAuth scopes 目前通过 `config.yml` 的 `mail.providers` 配置，没有单独的 `MAIL_*` 环境变量映射。

环境变量会覆盖同名的 `mail` 配置项。修改配置后重启应用，确保 OAuth callback 路由、同步运行时和 Push 配置使用新值。

## 常见问题

### OAuth 提示 redirect URI 不匹配

先根据 `app.publicOrigin`、应用 `publicBasePath` 和 `mail.oauthCallbackUrl` 拼出最终地址，再把这个完整地址登记到 Google Cloud Console 或 Microsoft Entra。只登记 `/mail/oauth/callback` 这样的应用内路径，或者漏掉 `/main`，都可能导致匹配失败。

### Provider 在账户关联界面中不可用

检查对应的 Server Provider 插件是否已启用，再检查 `mail.providers.<name>.type` 是否和 Provider 插件一致。Gmail 和 Microsoft 365 还必须填写 `clientId` 与 `clientSecret`。

### Push 没有触发同步

检查 Mail Core 的 `pushWebhookUrl` 和 `pushWebhookSecret` 是否同时配置。Gmail 还需要 `pushTopicName` 和 Pub/Sub 权限；Microsoft 365 需要应用能从公网接收 Graph callback。定时同步仍然会运行，不要关闭它。

### IMAP / SMTP 无法建立 TLS 连接

确认 endpoint 的 `secure` 和端口匹配。通常来说，IMAP `993`、SMTP `465` 使用 `secure: true`；SMTP `587` 通常使用 `secure: false` 并升级到 STARTTLS。只有在确认是自签名证书问题时，才考虑在测试环境设置 `rejectUnauthorized: false`。

## 相关链接

- [邮件插件功能清单](./feature-list.md) — 查看已实现能力和 Provider 差异
- [Gmail Provider](../../../app-plugin-mail-provider-gmail/README.md) — Gmail OAuth、API 和 Pub/Sub 说明
- [Microsoft 365 Provider](../../../app-plugin-mail-provider-microsoft/README.md) — Microsoft identity、Graph 和 Push 说明
- [IMAP / SMTP Provider](../../../app-plugin-mail-provider-imap-smtp/README.md) — 通用邮箱 endpoint 和账户凭据说明
