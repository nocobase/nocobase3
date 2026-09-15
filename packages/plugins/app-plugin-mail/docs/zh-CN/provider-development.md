---
title: '第三方 Mail Provider 开发指南'
description: '介绍如何为 NocoBase v3 Mail Core 开发、注册、测试和发布第三方邮件 Provider。'
keywords: 'NocoBase,Mail Provider,邮件插件,第三方 Provider,IMAP,SMTP,OAuth'
---

# 第三方 Mail Provider 开发指南

本文面向需要接入新的邮件服务商、企业邮件网关或自建邮件协议适配器的开发者。Provider 只负责服务商协议和能力适配，账户归属、凭据引用、同步状态、发送幂等和权限边界由 `@nocobase/app-plugin-mail` 的 Mail Core 负责。

## 设计边界

第三方 Provider 应作为独立的 NocoBase Server 插件发布，并通过 `mailProviderRegistryToken` 注册一个 `MailProviderDefinition`。业务页面或其他插件不应直接实例化 Provider adapter，也不应读取 Mail Core 的账户、凭据、同步游标或 Outbox 表。

Mail Core 只接收标准化账户、文件夹、邮件、附件、游标和 Provider 错误。Provider 可以使用任意 HTTP SDK、IMAP/SMTP 客户端或厂商 SDK，但不能把服务商 SDK 的对象直接泄露到 Mail Core 的公开类型中。

Provider 类型和配置实例名需要保持稳定。`type` 标识实现类型，`name` 标识应用配置中的实例；已经绑定账户后不要修改这两个值，否则 Mail Core 无法继续解析原账户的配置。

## 最小目录结构

推荐的第三方 Provider 目录结构如下，生产实现可以按协议拆分更多模块：

```text
packages/plugins/app-plugin-mail-provider-acme/
├── package.json
├── server/
│   ├── index.ts
│   ├── plugin.ts
│   ├── acme.ts
│   └── providers/mail-provider-acme.ts
├── tests/
│   ├── acme.test.ts
│   ├── compatibility.test.ts
│   └── server-provider.test.ts
└── README.md
```

Provider 包应把 `@nocobase/app-plugin-mail`、`@nocobase/app-server` 和 `@nocobase/service-provider` 声明为 peer dependency，并通过 Server Provider 在 Mail Core 启动后注册定义。Provider adapter 的运行时依赖，例如 HTTP 客户端、IMAP 或 SMTP 库，放在 Provider 自己的 dependencies 中。

## 定义 Provider

`MailProviderDefinition` 至少需要提供 `type`、`label`、`capabilities` 和 `createAdapter`。OAuth Provider 实现 `authorization`，用户名密码或 API key Provider 实现 `connection`，一个 Provider 必须且只能提供其中一种账户连接方式。

```ts
import type {
  MailAccount,
  MailProviderAdapter,
  MailProviderContext,
  MailProviderDefinition,
} from '@nocobase/app-plugin-mail/server/types';

export interface AcmeMailProviderConfig {
  readonly type: 'acme';
  readonly name: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export const acmeMailProviderDefinition: MailProviderDefinition<AcmeMailProviderConfig> =
  {
    type: 'acme',
    label: 'Acme Mail',
    capabilities: {
      receive: true,
      send: true,
      incrementalSync: true,
      pushNotifications: false,
      folders: true,
      labels: false,
      drafts: false,
      moveMessage: false,
      aliases: false,
    },
    validateConfig(config) {
      if (!config.clientId || !config.clientSecret)
        throw new Error('Acme OAuth configuration is incomplete.');
    },
    authorization: createAcmeAuthorization(),
    async createAdapter(
      context: MailProviderContext,
      config: AcmeMailProviderConfig,
      account: MailAccount,
    ): Promise<MailProviderAdapter> {
      return new AcmeMailProviderAdapter(context, config, account);
    },
  };
```

能力标记必须和 adapter 的实际方法一致。不要为了让 Provider 出现在界面中而声明尚未实现的能力；Mail Core 会根据能力决定是否展示同步、发信、草稿、移动、标签和 Push 相关流程。

## 能力与方法契约

| 能力                | adapter 必须提供的方法                                                              | 额外约束                                           |
| ------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| `receive`           | `listMessages`、`getMessage`、`getAttachment`                                       | 返回 Mail Core 可保存的标准化邮件和附件            |
| `incrementalSync`   | `getCurrentSyncCursor`、`listChanges`                                               | 游标必须是 Provider 自己的不透明值                 |
| `send`              | `sendMessage`                                                                       | 不确定是否已提交时返回 `submission_unknown`        |
| `folders`           | `listFolders`                                                                       | 层级和 Provider folder ID 要保持稳定               |
| `labels`            | `createLabel`、`updateLabels`                                                       | 不支持的标签语义不要映射成文件夹                   |
| `drafts`            | `saveDraft`、`updateDraft`                                                          | 需要返回可再次更新的 Provider message 标识         |
| `moveMessage`       | `moveMessage`                                                                       | 返回移动后新的 Provider message ID（如果发生变化） |
| `pushNotifications` | `upsertPushSubscription`、`deletePushSubscription`，以及 definition 的 `push.parse` | Push 只触发同步，不直接修改 Mail Core 邮件数据     |

`aliases` 表示授权或连接结果可以发现多个可发件地址，不要求 adapter 额外提供固定的方法；应在 `MailAuthorizedAccount.identities` 中返回每个地址的显示名称、主地址和 `canSend`。

即使 Provider 只实现收信，也应明确关闭 `send`、`drafts`、`moveMessage` 等能力。Mail Core 会拒绝调用缺失能力，测试也会把能力和方法不一致视为兼容性错误。

## OAuth、凭据与账户身份

OAuth `start` 必须使用 Mail Core 传入的 redirect URI、state、code challenge 和允许的 scopes。OAuth `complete` 需要返回服务商稳定的 `authorizationSubject`；如果服务商没有稳定主体标识，必须使用经过验证的账户地址，并在文档中说明地址变化风险。

Access token、refresh token、密码和 API key 只能写入 `context.credentials` 返回的凭据库引用，不能写入 `MailAccount`、日志、API 响应、前端状态或异常消息。`MailAuthorizedAccount.credentialReference` 只在 Mail Core 内部使用，账户 API 会主动省略它。

凭据刷新要通过 `getOrRefresh` 完成，并使用服务商返回的新 refresh token 覆盖旧值。刷新失败时返回可分类的 `MailProviderError`；认证失效应使用 `authentication` 类别并允许 Mail Core 将账户置为 `reauthorizationRequired`。

第三方 Provider 不需要自行实现 OAuth state 消费、PKCE verifier 清理、账户跨用户去重或重新授权按钮。应用会从账户页重新打开相同 Provider 的授权流程，Mail Core 负责复用稳定的账户主体并替换凭据。

## 同步实现

初次同步前 Mail Core 会调用 `getCurrentSyncCursor` 捕获基线，然后以受限页面调用 `listMessages` 导入历史邮件，最后从基线调用 `listChanges` 追赶初次同步期间产生的变化。后续自动同步和 Push 同步只调用增量流程。

Provider 游标必须可序列化、可恢复且不需要 Mail Core 解析。`listChanges` 需要返回 `nextCursor`、`hasMore` 和删除的 Provider message ID；分页过程中不能提前返回一个只在当前进程内有效的对象引用。

邮件去重使用 `(accountId, providerMessageId)`。Provider message ID 必须在同一个账户内稳定；如果服务商移动邮件会生成新 ID，应在 `moveMessage` 返回新 ID，并配合服务商的删除或替换语义避免创建重复本地邮件。

`NormalizedMailMessage` 的地址、日期、主题、文本、HTML、会话 ID、文件夹 ID 和附件都要完成协议到 Mail Core 类型的转换。HTML 只能保留安全内容；正文内的 `cid:` 图片应返回 `contentId` 和 `inline: true` 的附件，Mail Workspace 会把它解析为受权限保护的附件地址。

附件的 `providerAttachmentId` 必须能被后续 `getAttachment` 使用，`contentId` 去除 MIME 尖括号前后差异后仍应保持可匹配。不要把服务商的原始下载 URL 直接放入 HTML，因为这会绕过 Mail Core 的账户所有权检查。

## 发信、草稿与不确定结果

`sendMessage` 必须使用 Mail Core 传入的 `trackingId` 作为服务商侧幂等或关联标识。服务商明确接受时返回 `accepted`；明确拒绝时返回 `failed`；网络断开、超时或响应无法判断时返回 `submission_unknown`，不能把不确定结果伪装成失败后让调用方自动重试。

草稿能力只有在服务商支持创建和更新远端草稿时才开启。Mail Core 仍会先保存本地草稿；Provider 返回的远端草稿 ID 和 message ID 应在标准化邮件中保持一致，以便下一次更新不创建重复草稿。

发送 HTML、签名和模板内容时，Provider 应使用 Mail Core 传入的安全 HTML，并正确生成 MIME alternative。正文中的内联图片需要保留 `Content-ID` 和 inline disposition；普通下载附件不能被错误地标记为 inline。

## Push 通知

Push 定义只负责验证和解析 webhook 输入，返回 Provider message 变化对应的账户地址、订阅 ID 或 challenge response。解析器不能返回邮件正文、token 或其他敏感信息。

Push 处理完成后 Mail Core 会把通知合并为增量同步任务；Provider 不应在 webhook handler 中直接调用邮箱 API，也不应直接写 Mail Core 数据库。Push 不可用时，账户仍由自动同步间隔负责兜底。

## 注册和配置

通过一个 Server Provider 注册定义，保持 Provider 包和 Mail Core 的依赖边界：

```ts
import { mailProviderRegistryToken } from '@nocobase/app-plugin-mail/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';

export class MailProviderAcmeProvider extends ServiceProvider {
  public override async boot(): Promise<void> {
    this.container
      .resolve(mailProviderRegistryToken)
      .register(acmeMailProviderDefinition);
  }
}
```

应用配置使用稳定实例名：

```yaml
mail:
  providers:
    acme-work:
      type: acme
      clientId: replace-with-client-id
      clientSecret: replace-with-client-secret
```

Provider 不应把未安装的实现自动加入可用列表；只有已注册定义才会出现在 Mail Core 的 Provider 列表中，只有配置项存在且未禁用时才能关联账户。

## 兼容性测试

每个 Provider 包都应有一组不依赖真实第三方服务的兼容性测试，至少验证定义和 adapter 的以下关系：

- `type`、`label` 非空，且 `authorization` 与 `connection` 恰好存在一个。
- adapter 的 `identity.type` 与 definition 的 `type` 相同，adapter 的 `capabilities` 与 definition 完全一致。
- 每个为 `true` 的能力都有对应方法；每个明确不支持的能力不应暴露误导性方法。
- OAuth 或凭据连接不会把 token、密码或 refresh token 放入账户公开对象。
- `contentId`、inline 附件、稳定 Provider message ID 和分页 cursor 可以 round-trip。
- Provider 错误能映射为 `authentication`、`configuration`、`network`、`provider` 或 `content` 类别，并正确设置 `retryable`。
- adapter 的 `close` 可以安全重复调用，不会留下 socket、timer 或 HTTP 请求。

当前内置 Provider 的兼容性测试可以作为实现模板：Gmail、Microsoft 365 和 IMAP/SMTP 的 `tests/*` 都会构造真实定义和 adapter，并校验对应能力边界；测试不需要真实 OAuth、邮箱或 Push 服务。

建议运行以下命令完成 Provider 包验证：

```bash
pnpm --filter @nocobase/app-plugin-mail test
pnpm --filter @nocobase/app-plugin-mail-provider-gmail check
pnpm --filter @nocobase/app-plugin-mail-provider-microsoft check
pnpm --filter @nocobase/app-plugin-mail-provider-imap-smtp check
```

## 发布前清单

- 配置校验拒绝缺少必填项、越权 scopes、无效 endpoint 和不安全 callback 配置。
- 所有网络请求支持 `AbortSignal`、超时、错误分类和响应大小限制。
- 凭据只进入 credential vault，日志和错误中不出现 token、密码、授权码或完整请求头。
- 初次同步、增量同步、删除、附件、发信和服务商限流都有单元测试。
- 兼容性测试覆盖 definition、adapter、插件注册和能力边界。
- README 说明服务商权限、回调地址、Push 要求、已实现能力和明确不支持的能力。
- Provider 包通过 lint、format、typecheck、test 和 build，并在发布前运行 Mail Core 的完整测试。

## 相关文档

- [邮件插件配置](./configuration.md)
- [邮件功能清单](./feature-list.md)
- [邮件测试清单](./test-checklist.md)
