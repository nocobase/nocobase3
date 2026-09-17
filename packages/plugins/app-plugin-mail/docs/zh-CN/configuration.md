---
title: '配置邮件插件'
description: '整理 NocoBase v3 邮件插件 Mail Core、Gmail、Microsoft 365 和 IMAP / SMTP Provider 的配置项。'
keywords: 'NocoBase,邮件配置,邮箱,Gmail,Microsoft 365,IMAP,SMTP,OAuth,Push'
---

# 配置邮件插件

在 NocoBase 中，邮件插件的服务端配置放在 `config.yml` 的 `mail` 节点。大部分场景只需要配置 Provider 的必填参数；自动同步、OAuth callback 和 Push 通知按需配置即可。

`@nocobase/app-plugin-mail` 内置 Gmail、Microsoft 365 和 IMAP/SMTP Provider。应用只需注册 Mail 插件，并在 `mail.providers` 中添加对应类型的配置，无需安装或注册额外的内置 Provider 插件。

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

| 配置项                         | 类型      | 默认值                 | 环境变量                          | 说明                                                                             |
| ------------------------------ | --------- | ---------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `mail.oauthCallbackUrl`        | `string`  | `/mail/oauth/callback` | `MAIL_OAUTH_CALLBACK_URL`         | OAuth callback 的应用内路径，或完整的 `http(s)` URL。                            |
| `mail.automaticSyncIntervalMs` | `integer` | `300000`（5 分钟）     | `MAIL_AUTOMATIC_SYNC_INTERVAL_MS` | 所有账号统一使用的自动同步间隔，最小值为 `60000`（1 分钟），仅通过 config 配置。 |
| `mail.syncBatchSize`           | `integer` | `100`                  | `MAIL_SYNC_BATCH_SIZE`            | 每次 Provider 同步请求的邮件数量，范围为 `1–200`。                               |
| `mail.pushWebhookUrl`          | `string`  | 无                     | `MAIL_PUSH_WEBHOOK_URL`           | Push callback 的公共地址，应该以 `/mail/webhooks` 结尾。                         |
| `mail.pushWebhookSecret`       | `string`  | 无                     | `MAIL_PUSH_WEBHOOK_SECRET`        | Push callback 使用的共享密钥，长度为 `32–128`，只能使用字母、数字、`_` 和 `-`。  |
| `mail.providers`               | `object`  | `{}`                   | 无                                | 按实例名组织的 Provider 配置。具体字段见下文。                                   |

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

`mail.automaticSyncIntervalMs` 统一控制所有账号的自动同步间隔，不限制单次同步的执行时长。仅支持在 config 中配置，账号页面不提供配置入口。运行时每分钟检查到期账号；修改配置并重启应用后，新账号和已有账号均使用新的间隔，历史账号保存的间隔不再参与调度。

### OAuth callback 地址

默认值是应用内路径 `/mail/oauth/callback`。Mail Core 会把它拼接到应用的 `publicBasePath` 下，再使用 `app.publicOrigin` 生成 Provider 需要的完整地址。如果没有配置 `app.publicOrigin`，发起 OAuth 的请求地址会作为 origin。

比如应用公共地址是 `https://mail.example.com`，应用挂载在 `/main`，默认完整地址就是：

```text
https://mail.example.com/main/mail/oauth/callback
```

`main` 来自应用的 `app.publicBasePath` 默认值 `/main`。它不是邮件插件的固定路径。

本地开发时，如果模板的 `pnpm dev` 将 `APP_PUBLIC_ORIGIN` 填成了 `127.0.0.1`，而浏览器使用同端口的 `localhost` 访问，Mail Core 会自动采用请求中的 `localhost`，避免 Microsoft Entra 因回调地址主机名不同而拒绝请求。

如果浏览器通过其他端口或反向代理访问，或者希望本地 OAuth 地址完全固定，显式设置 `APP_PUBLIC_ORIGIN`：

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

Gmail 通过 Google Cloud Pub/Sub 把邮箱变更通知投递到 NocoBase；Microsoft 365 通过 Microsoft Graph 直接投递。两者都由 Mail Core 在收到通知后调度邮箱同步，通知本身不包含完整邮件内容。

| 配置工作                          | Gmail                                   | Microsoft 365                         |
| --------------------------------- | --------------------------------------- | ------------------------------------- |
| 配置 Mail Core 公网地址和共享密钥 | 需要                                    | 需要                                  |
| 配置 Provider OAuth 并关联邮箱    | 需要                                    | 需要                                  |
| 在云平台手动配置通知投递          | 创建 Pub/Sub Topic 和 Push subscription | 无需手动创建 Graph subscription       |
| Provider 额外配置                 | `pushTopicName`，可选 `pushLabelIds`    | 无                                    |
| 邮箱监听的创建和续期              | Mail Core 自动维护 Gmail watch          | Mail Core 自动维护 Graph subscription |

#### 1. 准备公共地址和密钥

准备一个可以从公网访问、使用有效 HTTPS 证书的应用地址。以下示例假设域名是 `https://mail.example.com`，应用的 `publicBasePath` 是 `/main`；请同时替换域名和应用挂载路径。本地 `localhost` 或 `127.0.0.1` 无法直接接收云端 Push，需要通过公网 HTTPS 反向代理或开发隧道转发到本地应用。

反向代理需要保留 webhook 路径、查询参数和 POST 请求体，并允许云端请求直接到达邮件插件。该路由使用共享密钥校验请求，不能被额外的网页登录、交互式验证码或浏览器 Cookie 校验拦截。`pushWebhookUrl` 应填写完整公共地址，包含应用挂载路径，以 `/mail/webhooks` 结尾，不加 `/api`；这个配置不会替你创建新的路由或自动补齐 `/main`。

生成一个随机密钥，例如：

```bash
openssl rand -hex 32
```

该命令生成 64 个十六进制字符，符合密钥要求：长度为 32–128，只能包含字母、数字、`_` 和 `-`。把生成结果填入下面的 `pushWebhookSecret`；示例占位符不能用作实际密钥。

```yaml
mail:
  pushWebhookUrl: https://mail.example.com/main/mail/webhooks
  pushWebhookSecret: replace-with-your-generated-random-secret
  providers:
    google:
      type: gmail
      clientId: replace-with-google-oauth-client-id
      clientSecret: replace-with-google-oauth-client-secret
      pushTopicName: projects/your-project-id/topics/mail-push
    microsoft-365:
      type: microsoft
      tenant: common
      clientId: replace-with-microsoft-entra-client-id
      clientSecret: replace-with-microsoft-entra-client-secret
```

只使用一个 Provider 时，保留对应的配置即可。`google` 和 `microsoft-365` 是 Provider 实例名，需要和已关联账户使用的实例名保持一致。两者可以共用同一组 Mail Core Push 配置。

Mail Core 在公共地址后追加 `/<Provider 类型>/<Provider 实例名>/<共享密钥>`，本例生成的完整 callback 地址为：

```text
Gmail:
https://mail.example.com/main/mail/webhooks/gmail/google/<secret>

Microsoft 365:
https://mail.example.com/main/mail/webhooks/microsoft/microsoft-365/<secret>
```

配置云平台时，把 `<secret>` 替换为与 `pushWebhookSecret` 完全相同的值，不保留尖括号。完整 URL 含有密钥，不要公开分享；代理访问日志应对该路径末段脱敏。

也可以通过环境变量覆盖公共地址和密钥：

```bash
MAIL_PUSH_WEBHOOK_URL=https://mail.example.com/main/mail/webhooks
MAIL_PUSH_WEBHOOK_SECRET=replace-with-your-generated-random-secret
```

两项必须同时配置才会启用 Push。Provider 的 OAuth 参数和 `pushTopicName` 仍在 `config.yml` 中配置。修改配置后重启应用。

#### 2. 配置 Gmail Pub/Sub

如果 Gmail 账户已经能够正常关联，可以复用现有 OAuth 客户端。新建时，在 Google Cloud 项目中启用 Gmail API，配置 OAuth 同意界面，并创建 **Web application** 类型的 OAuth 客户端；把最终 OAuth callback URL 登记为 **Authorized redirect URI**。测试阶段需要确保待关联账户符合应用的受众和测试用户配置。OAuth 客户端创建流程见 [Google 官方说明](https://developers.google.com/workspace/guides/create-credentials)。

接着配置 Pub/Sub：

1. 在 Google Cloud Console 选择 Gmail OAuth 客户端所属的项目，启用 **Cloud Pub/Sub API**。记录 Project ID，而不是项目显示名称或数字形式的 Project Number。
2. 进入 **Pub/Sub → Topics**，创建 Topic，例如 `mail-push`。把完整名称 `projects/your-project-id/topics/mail-push` 填入 `mail.providers.google.pushTopicName`。Topic 中的项目 ID 必须与执行 Gmail watch 的 Google 项目一致，见 [Gmail watch 的 Topic 要求](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch)。
3. 在该 Topic 的 **Permissions → Grant access** 中添加主体 `gmail-api-push@system.gserviceaccount.com`，授予 **Pub/Sub Publisher**（`roles/pubsub.publisher`）角色。授权对象是 Google 的 Gmail Push 服务账号，无需为它创建或下载私钥。该角色用于向 Topic 发布消息，见 [Pub/Sub 发布权限](https://docs.cloud.google.com/pubsub/docs/publisher)。
4. 进入 **Pub/Sub → Subscriptions**，创建订阅，例如 `mail-push-nocobase`，选择刚才的 Topic，把 **Delivery type** 设置为 **Push**。如果创建 Topic 时自动生成了 Pull subscription，仍需创建或配置用于 NocoBase 的 Push subscription。
5. 将 **Endpoint URL** 设置为完整 Gmail callback，例如 `https://mail.example.com/main/mail/webhooks/gmail/google/<secret>`。这里填写追加了 Provider 类型、实例名和实际密钥的地址，不能只填 `pushWebhookUrl`。
6. 保持默认消息包装格式，不勾选 **Enable payload unwrapping**。当前 Provider 读取 JSON 中的 `message.data`，再解码其中的邮箱地址；开启 unwrapping 会改变请求体结构，导致回调返回 `400`。两种格式的区别见 [Pub/Sub 消息包装说明](https://docs.cloud.google.com/pubsub/docs/payload-unwrapping)。
7. 保存订阅，重启 NocoBase，并在邮件账户页完成 Gmail 账户关联。已有正常关联的账户无需因首次启用 Push 而重新授权。

当前 Mail Core 校验 URL 路径中的共享密钥，没有内置 Pub/Sub OIDC JWT 校验。直接投递到当前应用时不要求启用 **Enable authentication**；如果部署入口要求 Google 身份认证，需要在入口配置对应的服务账号权限及 JWT 验证，不能把“勾选认证”视为邮件插件已经验证了 JWT。参见 [Pub/Sub Push 认证说明](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions)。

如果组织的 Domain Restricted Sharing 策略阻止添加 Gmail Push 服务账号，需要由组织管理员为该主体配置适用的例外。Gmail 对 Topic 发布权限及组织策略的说明见 [Gmail Push 官方指南](https://developers.google.com/workspace/gmail/api/guides/push)。

同一 Provider 实例下的多个邮箱可以共用这个 Topic 和 Push subscription，Mail Core 会分别为各个活跃账户创建 Gmail watch，并按通知中的邮箱地址定位账户。Pub/Sub subscription 负责“Topic 到 NocoBase”的投递，Gmail watch 负责“邮箱到 Topic”的发布，两者都配置成功才会收到通知。

可选配置 `pushLabelIds`，例如只监听与收件箱有关的变化：

```yaml
mail:
  providers:
    google:
      type: gmail
      clientId: replace-with-google-oauth-client-id
      clientSecret: replace-with-google-oauth-client-secret
      pushTopicName: projects/your-project-id/topics/mail-push
      pushLabelIds:
        - INBOX
```

`pushLabelIds` 只限制触发 Push 的 Gmail label，不改变邮件同步本身的范围，也不是 NocoBase 本地标签。希望其他文件夹的变化也能及时触发同步时，省略它。修改 Topic 或 label 配置后需要重启应用，已有 watch 的变更会在下次 watch 维护时提交，不应仅根据一次手动同步判断新监听配置已生效。

#### 3. 配置 Microsoft 365

如果微软账户已经能够正常关联，确认 Mail Core 公共地址和密钥已配置即可。如果尚未配置 OAuth，在 Microsoft Entra 管理中心完成以下步骤：

1. 进入 **App registrations**，创建或选择应用，按实际使用者选择支持的账户类型。单租户应用在 `tenant` 中填写对应的租户 ID；使用 `common` 时，应用注册的账户类型也需要支持相应的多租户或个人账户场景，`common` 本身不会改变应用注册的受众限制。
2. 在 **Authentication** 中添加 **Web** 平台，并登记最终 OAuth callback URL，例如 `https://mail.example.com/main/mail/oauth/callback`。
3. 将 **Application (client) ID** 填入 `clientId`。在 **Certificates & secrets** 中创建客户端密钥，将密钥的 **Value** 填入 `clientSecret`，不要填 Secret ID。
4. 在 **API permissions → Microsoft Graph → Delegated permissions** 配置当前 Provider 使用的权限：`User.Read`、`Mail.ReadWrite`、`Mail.Send`，并允许 OAuth 流程请求 `openid`、`profile`、`email` 和 `offline_access`。根据租户的用户同意策略，由用户或管理员完成同意授权。
5. 重启 NocoBase，在邮件账户页关联微软邮箱；如果原账户缺少新增权限，需要重新授权。

应用注册、Web 回调与客户端凭据操作见 [Microsoft 官方注册说明](https://learn.microsoft.com/en-us/graph/auth-register-app-v2)。当前 Provider 使用用户委托授权；Graph 支持的应用权限订阅并不表示当前插件支持无人登录的应用身份接入。委托权限订阅针对登录用户自己的邮箱，共享或委托邮箱订阅有额外限制，见 [Graph 邮件订阅权限说明](https://learn.microsoft.com/en-us/graph/api/subscription-post-subscriptions?view=graph-rest-1.0)。

无需在 Entra 中登记 webhook URL，也无需手动调用 Graph API 创建订阅。Mail Core 会为活跃账户创建 `me/messages` 订阅，监听 `created,updated,deleted`，设置生成的完整 callback URL，并用共享密钥作为通知的 `clientState`。

创建订阅时，Graph 向 callback URL 发起带有 `validationToken` 查询参数的 POST 请求。插件会在该 URL 上返回 `200`、`Content-Type: text/plain` 和解码后的 token；反向代理必须保留查询参数，不能将响应包装成 JSON。Graph 要求在 10 秒内完成验证，详见 [Graph webhook 验证流程](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)。

#### 4. 区分 OAuth callback 和 Push callback

以下地址承担不同职责，不能互换：

| 地址                                                                           | 填写位置                                                  | 用途                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------- |
| `https://mail.example.com/main/mail/oauth/callback`                            | Google OAuth 客户端和 Microsoft Entra 的 Web redirect URI | 用户关联邮箱时接收 OAuth 授权结果 |
| `https://mail.example.com/main/mail/webhooks`                                  | `mail.pushWebhookUrl`                                     | Mail Core 生成通知地址的公共基址  |
| `https://mail.example.com/main/mail/webhooks/gmail/google/<secret>`            | Google Pub/Sub Push subscription 的 Endpoint URL          | 接收 Gmail 通知                   |
| `https://mail.example.com/main/mail/webhooks/microsoft/microsoft-365/<secret>` | Mail Core 自动提交给 Graph                                | 接收微软通知和验证请求            |

如果自定义了 `mail.oauthCallbackUrl`，第一行使用自定义后的最终地址。OAuth callback 的路径解析规则见 [OAuth callback 地址](#oauth-callback-地址)。

#### 5. 验证投递和同步

1. 重启应用后，打开 `/dev/mail/accounts`，确认目标账户处于活跃状态，且手动同步能够成功。手动同步失败时，先解决 OAuth、Provider API 或队列问题。
2. 等待运行时维护订阅。当前实现启动时执行一次维护，之后每分钟检查活跃账户；邮箱较多或 Provider 请求较慢时可能需要更长时间。
3. 对微软，可以从外部终端用下面的 POST 请求检查 URL 验证链路。把示例中的 `<secret>` 替换为实际密钥。

   ```bash
   curl -i -X POST \
     'https://mail.example.com/main/mail/webhooks/microsoft/microsoft-365/<secret>?validationToken=mail-webhook-check' \
     -H 'Content-Type: text/plain' \
     --data ''
   ```

   预期响应为 `200`、`Content-Type: text/plain`，正文为 `mail-webhook-check`。此检查只证明回调可达且验证分支正常，不代表已成功创建 Graph subscription。浏览器地址栏发出的是 GET 请求，不能用它判断 POST webhook 是否工作。

4. 从另一个邮箱发送一封新邮件到已关联账户。Gmail 若配置了 `pushLabelIds: [INBOX]`，应让测试邮件进入收件箱。
5. 检查 Gmail Pub/Sub 的订阅投递指标，以及应用或代理的 webhook POST 状态码。当前插件接受普通通知后返回 `202` 和 `{"accepted":true}`；再到 `/dev/mail/sync-logs` 检查同步结果，并在邮件中心确认邮件出现。

仅看到邮件出现不能证明 Push 成功，因为定时同步也会导入邮件；需要结合云端投递和应用 callback 请求记录判断。`202` 只表示通知已接受，不表示邮件已同步完成，也不保证通知匹配到了活跃账户。收到重复通知或已有同步任务运行时，Mail Core 会合并或延后处理，无需期待每次通知都产生一条独立同步记录。

#### 6. 续期与配置变更

当前 Gmail Provider 将下一次 watch 维护时间设为“一天后”和“到期前一小时”中的较早时间；Microsoft Provider 创建约两天有效的订阅，并在到期前十二小时开始续期。维护依赖应用运行时持续运行，不需要另建续期定时任务。Google 要求至少每七天重新调用一次 watch，并建议每天续期，见 [Gmail watch 续期说明](https://developers.google.com/workspace/gmail/api/guides/push)。

变更公网域名、挂载路径或共享密钥后，更新 Mail Core 配置并重启应用。Gmail 还需要手动更新 Pub/Sub subscription 的 Endpoint URL；Microsoft 的旧订阅由 Mail Core 在维护时替换。轮换密钥期间旧地址会被拒绝，应协调应用配置和云端 endpoint 的更新。

保留自动同步作为兜底。Push 可能延迟或丢失，不能把通知理解为每封邮件只触发一次且必定送达的事件流。

## Provider 配置

`mail.providers` 是一个以实例名为 key 的对象。每个实例至少需要 `type`；Gmail、Microsoft 365 和 IMAP/SMTP 类型已内置：

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

Gmail Push 还需要配置 Mail Core 的 `pushWebhookUrl` 和 `pushWebhookSecret`，并在 Google Cloud Pub/Sub 中手动把 Push subscription 的 endpoint 设置为生成后的完整 Gmail callback 地址。Pub/Sub topic 还必须允许 Gmail Push 服务账号发布消息。逐步操作见 [配置 Gmail Pub/Sub](#2-配置-gmail-pubsub)。

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

Microsoft Graph Push 还需要配置 Mail Core 的 `pushWebhookUrl` 和 `pushWebhookSecret`，不需要在 Microsoft Graph 或 Microsoft Entra 中手动配置 webhook 地址。Graph subscription 由 Mail Core 在账户连接后创建、验证和续期。逐步操作见 [配置 Microsoft 365](#3-配置-microsoft-365)。

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
      # sentCopyMode: client
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

| 配置项         | 必填 | 默认值   | 说明                                                                                                             |
| -------------- | ---- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `sentCopyMode` | 否   | `server` | `server` 由 SMTP 服务商保存已发送副本；不自动保存的服务商可设为 `client`，由客户端追加到现有 IMAP 已发送文件夹。 |
| `sentFolder`   | 否   | 自动识别 | IMAP Sent 文件夹路径提示。                                                                                       |
| `trashFolder`  | 否   | 自动识别 | IMAP Trash 文件夹路径提示。                                                                                      |
| `draftsFolder` | 否   | 自动识别 | IMAP Drafts 文件夹路径提示。                                                                                     |

IMAP / SMTP MVP 不支持 Push、Provider-native label、草稿、别名和移动到文件夹。`pushWebhookUrl` 和 `pushWebhookSecret` 对这个 Provider 不生效。

### Gmail 通过 IMAP / SMTP 接入

在现有 `mail.providers` 下增加 `gmail-imap` 实例，可以与 Gmail OAuth、163 等配置同时使用：

```yaml
mail:
  providers:
    gmail-imap:
      type: imap-smtp
      imap:
        host: imap.gmail.com
        port: 993
        secure: true
      smtp:
        host: smtp.gmail.com
        port: 465
        secure: true
      sentCopyMode: server
```

修改配置后重启应用，在 `/dev/mail/accounts` 选择 `IMAP / SMTP · gmail-imap`。邮箱地址和用户名均填写完整 Gmail 地址；密码填写 Google 的应用专用密码，去掉显示时用于分组的空格，不要填写 Google 账户登录密码，也不要把凭据写入 `config.yml`。

先开启 Google 账户的两步验证，再到 [应用专用密码](https://myaccount.google.com/apppasswords) 页面生成 16 位密码。组织账户、仅使用安全密钥的两步验证或高级保护可能不提供此选项；此时使用上面的 Gmail OAuth 接入。Google Workspace 还需要管理员允许 IMAP 访问。具体限制见 [Google 应用专用密码说明](https://support.google.com/accounts/answer/185833?hl=zh-Hans)。

Gmail SMTP 会自动保存已发送邮件，因此保持 `sentCopyMode: server`，避免重复保存，见 [Google IMAP 客户端设置](https://support.google.com/mail/answer/78892?hl=zh-Hans)。此配置使用通用 IMAP/SMTP 的定期同步和能力；Gmail API、原生标签及 Pub/Sub Push 仍需使用 `type: gmail`。

## 环境变量

Mail Core 提供以下环境变量映射：

```bash
MAIL_OAUTH_CALLBACK_URL=/mail/oauth/callback
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

检查 Mail Server 插件是否已启用，再检查 `mail.providers.<name>.type` 是否为 `gmail`、`microsoft` 或 `imap-smtp`。第三方类型需要额外注册对应的 Provider 插件。Gmail 和 Microsoft 365 还必须填写 `clientId` 与 `clientSecret`。

### Push 没有触发同步

先确认 `pushWebhookUrl` 和 `pushWebhookSecret` 同时配置、应用已重启，账户处于活跃状态。然后按 [验证投递和同步](#5-验证投递和同步) 区分“没有建立监听”“通知投递失败”和“接受通知后同步失败”。

| 现象                                      | 检查方向                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Gmail watch 报 Topic 不存在或无发布权限   | 确认完整 Topic 名称、OAuth 项目 ID，以及 `gmail-api-push@system.gserviceaccount.com` 在该 Topic 上的 Publisher 权限 |
| 无法为 Gmail 服务账号添加权限             | 检查组织的 Domain Restricted Sharing 策略，由管理员处理适用的例外                                                   |
| Topic 有消息，但应用没有 POST 请求        | 确认订阅类型是 Push、Endpoint 是完整 callback URL，并检查 Pub/Sub 投递指标、DNS、TLS 和代理入口限制                 |
| 应用 webhook 返回 `401`                   | 核对 URL 中的密钥与当前配置；微软还需核对通知的 `clientState`。若响应来自网关，检查网关自己的认证要求               |
| 应用 webhook 返回 `404`                   | 核对 `/main` 等挂载路径、`/mail/webhooks` 路由、Provider 类型和实例名，确认对应插件已注册且 Provider 未禁用         |
| Gmail callback 返回 `400`                 | 确认未启用 Payload unwrapping，请求保持 JSON 包装格式且包含有效的 `message.data`；普通测试文本不是合法 Gmail 通知   |
| 微软提示 notification URL validation 失败 | 检查公网 HTTPS、POST 转发、`validationToken` 参数、纯文本响应及 10 秒响应时限；先运行上面的验证请求                 |
| Graph 创建订阅报权限不足                  | 检查委托权限及用户或管理员同意状态；权限变更后重新授权，确认订阅的是登录用户自己的邮箱                              |
| Callback 返回 `202`，但没有同步结果       | 检查是否匹配活跃账户、是否已有运行中的同步、队列 worker 和同步日志；`202` 不能单独证明邮件导入成功                  |
| 曾经有效，数天后停止通知                  | 检查应用是否持续运行、OAuth 是否需要重新授权、客户端密钥是否过期，以及服务器订阅续期错误                            |

订阅创建和续期错误写入应用服务器日志，可搜索 `Mail push subscription could not be renewed.` 或 `Mail push subscription maintenance failed.`。Webhook 接受后的任务错误可搜索 `Push-triggered Mail synchronization could not be activated.`。共享日志前应移除 token、密钥和完整 webhook URL。

### IMAP / SMTP 无法建立 TLS 连接

确认 endpoint 的 `secure` 和端口匹配。通常来说，IMAP `993`、SMTP `465` 使用 `secure: true`；SMTP `587` 通常使用 `secure: false` 并升级到 STARTTLS。只有在确认是自签名证书问题时，才考虑在测试环境设置 `rejectUnauthorized: false`。

## 相关链接

- [邮件插件功能清单](./feature-list.md) — 查看已实现能力和 Provider 差异
- [Gmail Provider](../providers/gmail.md) — Gmail OAuth、API 和 Pub/Sub 说明
- [Microsoft 365 Provider](../providers/microsoft.md) — Microsoft identity、Graph 和 Push 说明
- [IMAP / SMTP Provider](../providers/imap-smtp.md) — 通用邮箱 endpoint 和账户凭据说明
