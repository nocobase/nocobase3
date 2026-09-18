---
title: '邮箱接入配置'
description: '通过 AI 分步引导完成邮箱接入，按需查阅手动配置、OAuth 回调和同步设置。'
---

# 邮箱接入配置

本页供搭建应用时按需查阅。应用搭建者先配置可用的邮箱服务商，每位用户再在应用中关联自己的邮箱。已有应用已完成配置时，直接按[快速开始](./quick-start.md#第二步关联邮箱)关联账户即可。

## 推荐：让 AI 引导配置

你只需先说明邮箱类型、应用访问地址和使用范围，例如仅公司内部使用，还是允许其他用户关联邮箱。已有 OAuth 应用时也一并说明，让 AI 检查能否复用。无需先理解所有配置项，可以把下面的需求交给应用 Agent：

> 请引导我为当前应用接入 Gmail 邮箱（也可以替换为 Microsoft 365 或 IMAP/SMTP）。先读取邮件插件 Skill 和已有配置，确认应用访问地址及使用范围，列出还缺少的信息。请完成项目内的配置，并将需要我在服务商平台操作的部分逐步说明，每一步给出入口、填写值和完成后的检查方法。OAuth 回调地址请根据当前项目生成，权限以当前插件要求为准。密钥请告诉我在本地哪里填写，不要让我直接粘贴到对话中。配置完成后，引导我关联一个邮箱，检查授权返回、首次同步和收发信是否正常。

### 配置过程

1. **确认接入信息**：AI 检查当前应用，确认服务商、部署地址和已有配置。使用 IMAP/SMTP 时，根据服务商提供的信息确认服务器地址、端口和连接方式。
2. **完成平台操作**：使用 Gmail 或 Microsoft 365 时，AI 给出需要登记的回调地址、权限和操作步骤。你在服务商平台登录，创建或选择 OAuth 应用，并完成所需授权或管理员审批。AI 工具支持浏览器操作时，也可以让它辅助填写。
3. **完成应用配置**：AI 生成或更新配置文件，标明客户端 ID、密钥等信息的填写位置。你在本地填写敏感值，再由 AI 检查配置结构和启动结果，检查输出应隐藏密钥。
4. **验证接入结果**：在应用中关联一个邮箱，确认授权后能返回应用、首次同步正常，并完成一次收发信。

这里的分步引导由应用 Agent 根据项目情况完成。服务商账户登录、用户授权和必要的管理员审批仍需相应账户持有人完成；遇到平台权限或审核要求时，由 AI 说明下一步需要谁处理。

## 手动配置（备用）

需要自行配置或核对 AI 生成的结果时，可查阅下面的准备清单和配置示例。

### 服务商平台图文参考

原有文档提供了控制台操作截图，可作为手动操作的补充：

- [邮件配置流程](https://docs.nocobase.com/cn/email-manager/configuration/guide)
- [Gmail 服务商配置](https://docs.nocobase.com/cn/email-manager/configuration/gmail)
- [Outlook / Microsoft 服务商配置](https://docs.nocobase.com/cn/email-manager/configuration/outlook)

这些指南面向旧版邮件插件，仅参考其中的服务商平台操作。旧版 NocoBase 设置入口、回调地址和权限列表不适用于当前应用；请使用 AI 根据当前项目生成的值，或按本页的配置说明填写。服务商控制台界面如有变化，以当前平台提示为准。

### 需要准备什么

| 接入方式      | 应用搭建者准备                                        | 邮箱用户填写或操作             |
| ------------- | ----------------------------------------------------- | ------------------------------ |
| IMAP/SMTP     | 收信和发信服务器地址、端口及连接方式                  | 邮箱地址、用户名、密码或授权码 |
| Gmail         | Google OAuth Web 应用的客户端 ID、密钥和回调地址      | 登录 Google 账户并授权         |
| Microsoft 365 | Microsoft Entra 应用的客户端 ID、密钥、租户及回调地址 | 登录 Microsoft 账户并授权      |

可以让 AI 按所选接入方式完成应用配置。IMAP/SMTP 服务器信息由邮箱服务商提供；Gmail 和 Microsoft 365 需要在对应平台创建 OAuth 应用，并登记[OAuth 回调地址](#oauth-回调地址)。

以下配置写入应用 `config.yml` 的 `mail` 节点，修改后重启应用。一个应用可以配置多个服务商实例；实例名会关联到已有账户，投入使用后应保持稳定。实例的 `enabled` 默认是 `true`，设为 `false` 后，关联账户将无法继续使用该实例。

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

### 已发送邮件的保存（按需配置）

`sentCopyMode` 默认为 `server`，由 SMTP 服务保存已发送副本。服务端不保存副本时，设置为 `client`，插件会将已发送邮件追加到 `sentFolder` 指定的现有文件夹，或服务端标记为「已发送」的文件夹：

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
      sentCopyMode: client
      sentFolder: Sent
```

服务端已经自动保存副本时，保持 `server`，避免产生重复副本。客户端保存失败会记录 `IMAP_SENT_COPY_FAILED`，不会重发已被 SMTP 接受的邮件。

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

自动同步间隔统一通过配置管理，对新账户和已有账户生效，账户页面不单独调整。运行时每分钟检查到期账户，因此实际启动时间可能稍晚于设定间隔。

首次关联账户时可以选择历史邮件的起始日期。插件导入该日期及之后的邮件；不设置日期时导入全部历史。历史导入没有累计封数上限。`syncBatchSize` 只控制单次请求的批量大小，不限制账户邮件总量。

历史导入与增量同步交替推进，每批保存进度。服务重启后可以恢复中断任务；游标失效时会重新扫描账户配置的历史范围。可在应用的同步记录中查看进度和正文待处理状态。

## 推送同步（可选）

默认周期同步即可自动获取邮件。需要更及时地获取变化时，可以启用推送。推送可让 Gmail 和 Microsoft 365 的邮箱变更更快触发增量同步。先同时配置公共回调地址和密钥：

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

不要将真实的 OAuth 密钥、推送密钥和邮箱密码提交到仓库。当前核心插件的默认凭据存储将授权数据以普通 JSON 保存在数据库中；如应用要求加密保存，可按[应用开发](./development.md#扩展服务商和凭据存储)接入替代实现。

## 配置完成后

回到[快速开始](./quick-start.md#第二步关联邮箱)，关联邮箱并完成一次收发。
