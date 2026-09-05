# Mail 插件外部框架与库调研

> 调研日期：2026-09-02
> 范围：NocoBase v3 `@nocobase/app-plugin-mail` 服务端架构与 Provider 接口；本文不评估 UI 组件。所有事实链接均指向项目官方仓库、官方文档或标准正文。

## 结论

当前的 `MailService -> MailStore / MailProviderRegistry -> MailProviderDefinition -> per-account MailProviderAdapter` 分层方向正确。第三方 SDK 不应进入 Mail 核心的公开类型，而应封装在独立 Provider 包内。这样既能避免 Gmail、Microsoft Graph、IMAP/JMAP 的数据模型泄漏，也能独立升级认证与协议依赖。

首版推荐栈：

| Provider       | 推荐依赖                                                                                                                                                                                                                                                                                                               | 结论                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Gmail          | [`@googleapis/gmail`](https://www.npmjs.com/package/@googleapis/gmail) + [`google-auth-library`](https://github.com/googleapis/google-auth-library-nodejs) + Nodemailer `MailComposer`                                                                                                                                 | 直接使用；只安装按 API 拆分的 Gmail 包，不安装完整 `googleapis` 聚合包    |
| Microsoft 365  | [`@microsoft/microsoft-graph-client`](https://github.com/microsoftgraph/msgraph-sdk-javascript) + [`@microsoft/microsoft-graph-types`](https://github.com/microsoftgraph/msgraph-typescript-typings) + [`@azure/msal-node`](https://github.com/AzureAD/microsoft-authentication-library-for-js/tree/dev/lib/msal-node) | 直接使用稳定 JavaScript SDK；完整的新 TypeScript SDK 仍应单独验证后再替换 |
| 通用 IMAP/SMTP | [`imapflow`](https://github.com/postalsys/imapflow) + [`nodemailer`](https://github.com/nodemailer/nodemailer) + [`postal-mime`](https://github.com/postalsys/postal-mime)                                                                                                                                             | 直接使用；分别负责收取/同步、SMTP 与 MIME 生成、MIME 解析                 |
| JMAP           | Node 24 `fetch` 或小范围试验 [`jmap-jam`](https://github.com/htunnicliff/jmap-jam)                                                                                                                                                                                                                                     | 暂不列为首版必选依赖；协议非常适合当前抽象，但 Node 客户端生态还不够成熟  |
| 统一邮件网关   | EmailEngine 或 Nylas Adapter                                                                                                                                                                                                                                                                                           | 仅做可选 Provider；不得成为核心运行时依赖                                 |

首版不应引入 Stalwart、Apache James、WildDuck 或 Postal。它们是邮件服务器/投递平台，不是用于连接用户现有邮箱的 Node Provider SDK。

## 候选矩阵

“活跃度”依据官方仓库近期提交/发布记录及官方维护声明判断，只表达本次调研时点，不承诺未来状态。

| 候选                                                                                                   | 类型                        | 许可证/商业约束                                                                                                                           | Node 24、ESM、TypeScript 适配                                                     | 多 Provider 适配                                 | 建议                                |
| ------------------------------------------------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| [ImapFlow](https://imapflow.com/docs/)                                                                 | IMAP 客户端                 | [MIT](https://github.com/postalsys/imapflow/blob/master/LICENSE.txt)；仓库持续发布与修复                                                  | Promise API、内置类型；可在 Provider 内隔离模块格式与 Node stream                 | 只解决 IMAP，但可良好映射 Adapter                | **直接使用**                        |
| [Nodemailer](https://nodemailer.com/)                                                                  | SMTP 客户端与 MIME composer | [MIT-0](https://nodemailer.com/license)；长期维护                                                                                         | Node 原生；类型来自 DefinitelyTyped，模块边界应隔离                               | SMTP、Gmail raw MIME、Graph raw MIME 可复用      | **直接使用**                        |
| [PostalMime](https://github.com/postalsys/postal-mime)                                                 | MIME parser                 | [MIT-0](https://github.com/postalsys/postal-mime/blob/master/LICENSE.txt)；持续维护                                                       | 官方提供 ESM/CJS 双出口和 TypeScript 类型，零运行时依赖                           | 与 Provider 无关                                 | **直接使用**                        |
| [MailParser](https://nodemailer.com/extras/mailparser)                                                 | 流式 MIME parser            | MIT；官方明确处于 maintenance mode                                                                                                        | Node stream 友好；类型来自 DefinitelyTyped                                        | 与 Provider 无关                                 | 仅在超大附件必须流式解析时使用      |
| [Google APIs Node.js Client](https://github.com/googleapis/google-api-nodejs-client)                   | Gmail 官方 SDK              | [Apache-2.0](https://github.com/googleapis/google-api-nodejs-client/blob/main/LICENSE)；Google 官方支持，但仓库声明完整功能线处于维护模式 | TypeScript 编写并自带类型，支持 Node 当前/LTS 版本                                | 只解决 Google                                    | **直接使用拆分包**                  |
| [Microsoft Graph JS SDK](https://github.com/microsoftgraph/msgraph-sdk-javascript)                     | Graph 官方 SDK              | MIT；官方仓库仍维护                                                                                                                       | 服务端可用、内置 TypeScript；官方仓库当前声明 Node 12+，在 Node 24 上仍需集成测试 | 只解决 Microsoft                                 | **直接使用稳定版并包在 Adapter 内** |
| [MSAL Node](https://github.com/AzureAD/microsoft-authentication-library-for-js/tree/dev/lib/msal-node) | Microsoft OAuth 客户端      | MIT；活跃维护                                                                                                                             | TypeScript、Node 服务端；Node 24 适配良好                                         | Microsoft 专用                                   | **直接使用**                        |
| [JMAP / RFC 8621](https://www.rfc-editor.org/rfc/rfc8621)                                              | 标准协议                    | 开放标准                                                                                                                                  | Node 24 可直接 `fetch`；第三方 TS SDK 规模普遍较小                                | 服务端实现了 JMAP 即可统一                       | 协议参考，第二阶段 Provider         |
| [EmailEngine](https://github.com/postalsys/emailengine)                                                | 自托管统一邮箱网关          | [商业/source-available EULA](https://github.com/postalsys/emailengine/blob/master/LICENSE_EMAILENGINE.txt)，生产使用需要许可证            | 独立 Node 服务，不宜嵌入包进程                                                    | 原生统一 IMAP/SMTP、Gmail、Graph、OAuth、webhook | 可选 sidecar；**不可作为默认依赖**  |
| [Nylas Node SDK](https://github.com/nylas/nylas-nodejs)                                                | 托管统一邮件 API            | SDK 为 MIT；实际能力依赖 Nylas 商业服务                                                                                                   | TypeScript、Node 18+、ESM/CJS                                                     | 高，统一多个上游 Provider                        | 可选托管 Provider，需产品与合规决策 |
| [Stalwart](https://github.com/stalwartlabs/stalwart)                                                   | 完整邮件服务器              | AGPL-3.0                                                                                                                                  | Rust 独立服务，不是 Node 库                                                       | 服务自己的 JMAP/IMAP/SMTP，不连接外部账户        | 仅作同步/存储架构参考               |
| [Apache James](https://github.com/apache/james-project)                                                | 完整邮件服务器              | Apache-2.0                                                                                                                                | Java/JVM 独立服务                                                                 | 同上                                             | 仅作模块化/分布式架构参考           |
| [WildDuck](https://github.com/zone-eu/wildduck)                                                        | IMAP/POP3 邮件服务器        | EUPL-1.2                                                                                                                                  | Node 服务，但不是客户端 SDK                                                       | 同上                                             | 仅作数据模型参考                    |
| [Postal](https://github.com/postalserver/postal)                                                       | 邮件投递平台                | MIT                                                                                                                                       | 独立服务                                                                          | 类似 SendGrid，非用户邮箱同步                    | 不适用于 MailService 核心           |

## 协议与 Provider 评估

### 通用 IMAP/SMTP

[ImapFlow](https://imapflow.com/docs/) 是目前最合适的通用 IMAP 客户端。官方文档列出 mailbox lock、async iterator、IDLE、CONDSTORE/QRESYNC、MOVE、SPECIAL-USE 以及 Gmail label 扩展，可映射到 `listFolders`、`listMessages`、`listChanges`、`getMessage`、`setRead`、`setStarred`、`moveMessage` 和 `deleteMessage`。需要注意：IDLE 只监视当前打开的 mailbox，且连接重建与调度仍由应用负责；Provider 应把 IDLE 当作“唤醒同步”的信号，由 NocoBase queue 执行可重试的增量同步，而不是把长连接当作数据真相。

IMAP 的 UID 只在 mailbox 内有效，并受 `UIDVALIDITY` 约束；[RFC 9051](https://www.rfc-editor.org/rfc/rfc9051) 明确了该作用域。因此 Generic Provider 不能把裸 UID 当作账户级 `providerMessageId`，至少应组合 mailbox、UIDVALIDITY 与 UID。同步游标也应逐 mailbox 保存 `UIDVALIDITY`、`UIDNEXT`、`HIGHESTMODSEQ` 等 Provider 私有状态。

[Nodemailer SMTP transport](https://nodemailer.com/smtp) 适合发送，[MailComposer](https://nodemailer.com/extras/mailcomposer) 可生成 RFC 822 Buffer/stream，同一份 MIME 可用于 SMTP、[Gmail API raw message](https://developers.google.com/workspace/gmail/api/guides/sending) 和 [Graph MIME sendMail](https://learn.microsoft.com/en-us/graph/outlook-send-mime-message)。它是 CommonJS/JavaScript 传统包，类型来自 `@types/nodemailer`；这不是阻塞项，但必须只在 Provider 实现内出现，不能把 Nodemailer 类型导出到公共契约。

解析首选 [PostalMime](https://github.com/postalsys/postal-mime)：官方仓库说明其支持 Node、提供 ESM/CJS 双格式与 TypeScript 类型、零依赖，并带 MIME 嵌套/头部大小限制。PostalMime 返回的附件内容需要驻留内存；如果后续验证表明必须对超大消息做真正的逐段流式解析，再局部采用 [MailParser](https://nodemailer.com/extras/mailparser)。MailParser 官方文档同时提醒 `html` 不会被净化；实际上所有 Provider 的 HTML 都应视为不可信输入。

### Gmail

应使用官方拆分包 `@googleapis/gmail` 和 `google-auth-library`。官方 Node 客户端仓库说明其用 TypeScript 编写并自带类型；Gmail API 原生覆盖 messages、threads、labels、drafts、attachments、sendAs aliases，可映射当前大部分 Adapter 能力。

增量同步使用 [`users.history.list`](https://developers.google.com/workspace/gmail/api/guides/sync) 的 `historyId`。历史游标过期时 API 返回 404，Provider 必须把它归一化为“游标失效，需要全量同步”，而不是普通永久错误。[Gmail push](https://developers.google.com/workspace/gmail/api/guides/push) 通过 Google Cloud Pub/Sub 发送 mailbox 变更通知；`watch` 必须至少每七天续订，官方建议每天续订。通知仍只携带重新同步所需的信息，不能直接作为本地消息状态。

### Microsoft 365 / Graph

稳定方案采用官方 [`@microsoft/microsoft-graph-client`](https://github.com/microsoftgraph/msgraph-sdk-javascript) 与 Graph typings，认证使用 MSAL Node；这些类型同样应止于 Microsoft Provider 边界。

Graph 的消息 delta 是[逐文件夹维护](https://learn.microsoft.com/en-us/graph/delta-query-messages)的，返回的 `@odata.nextLink` / `@odata.deltaLink` 应作为 opaque cursor 原样保存。请求应统一指定 [ImmutableId](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)，但官方仍说明消息移动到 archive mailbox 时 ID 可能变化。Graph 的 [`move`](https://learn.microsoft.com/en-us/graph/api/message-move?view=graph-rest-1.0) 会在目标文件夹创建新消息并删除原消息，因此现有 `MailProviderMoveResult.providerMessageId` 允许返回新 ID 是正确的。

Graph [sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0) 成功只返回空 body 的 `202 Accepted`，并且接受不等于处理或投递完成。现有 `MailProviderSendResult` 在 `accepted` 时强制要求 `providerMessageId`，无法如实实现 Graph，也不完全符合 SMTP 的“服务器已接受”语义。

Graph [change notifications](https://learn.microsoft.com/en-us/graph/change-notifications-overview) 需要创建、续订、删除有过期时间的 subscription，并完成 webhook 验证；[webhook 投递文档](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks) 还要求快速响应并处理重试/慢端点。Graph [throttling 指南](https://learn.microsoft.com/en-us/graph/throttling) 要求尊重 `Retry-After`。这些信息应归一化到队列任务、重试策略和 Provider error，而不是散落在 HTTP route 中。

### JMAP

[RFC 8621](https://www.rfc-editor.org/rfc/rfc8621) 的 Mailbox、Thread、Email、Identity、EmailSubmission 与 `/changes` 模型，和当前领域契约最接近；[RFC 8620 push](https://www.rfc-editor.org/rfc/rfc8620#section-7) 也采用状态通知后再同步的模式。JMAP 值得保留独立 Provider 插槽，但首版无需为规模较小的客户端生态增加核心依赖。可先用 Node 24 原生 `fetch` 做兼容性试验，再决定采用官方 [JMAP software list](https://jmap.io/software.html) 中的客户端。

## 完整平台：可以参考，默认不嵌入

[EmailEngine](https://learn.emailengine.app/) 的能力与目标最接近：把 IMAP/SMTP、Gmail、Microsoft Graph、OAuth 与账户变更 webhook 统一成 REST API。它很适合验证 Provider 层应暴露哪些行为，也可以实现为一个独立的 `emailengine` Provider；但其[许可证](https://github.com/postalsys/emailengine/blob/master/LICENSE_EMAILENGINE.txt)不是宽松开源许可证，生产使用和源码修改受商业条款约束，所以不能成为 NocoBase Mail 的默认内嵌实现。

[Nylas](https://developer.nylas.com/docs/v3/email/) 提供托管统一 API，官方 [Node SDK](https://github.com/nylas/nylas-nodejs) 是 TypeScript 且采用 MIT；不过实际收信、同步与 webhook 依赖外部商业服务。[Webhook 文档](https://developer.nylas.com/docs/v3/notifications/) 和 [grant lifecycle](https://developer.nylas.com/docs/dev-guide/best-practices/grant-lifecycle/) 可用作账户状态、重授权和通知模型参考。若未来有“快速接入大量 Provider”的商业需求，可增加 Nylas Provider，但核心不能假设它存在。

Stalwart、James、WildDuck 都是运营自有邮箱域与邮箱存储的完整服务器，不是连接用户已有 Gmail/Outlook/IMAP 账户的库。Stalwart 的[存储后端拆分](https://stalw.art/docs/storage/backends/)值得借鉴：结构化数据、blob、全文索引与缓存可以独立演进。Apache James 的[组件化与分布式架构](https://james.apache.org/server/feature-distributed.html)也只应作为远期规模化参考。Postal 的[官方定位与 HTTP API](https://docs.postalserver.io/developer/api/)面向应用邮件投递，而非双向邮箱同步。

## 与现有契约的映射

| 当前契约                          | Gmail                     | Microsoft Graph                     | IMAP/SMTP                          | 判断                                         |
| --------------------------------- | ------------------------- | ----------------------------------- | ---------------------------------- | -------------------------------------------- |
| `MailProviderDefinition`          | Google 配置/OAuth factory | Azure tenant/app 配置/OAuth factory | 主机、端口、TLS/auth factory       | 保留；外部 SDK 不应泄漏到 config 基础类型    |
| per-account `MailProviderAdapter` | Gmail user client         | Graph `/me` client                  | 一个账户的 ImapFlow/SMTP client    | 保留；生命周期与隔离边界合理                 |
| `listFolders`                     | labels                    | mailFolders                         | LIST + SPECIAL-USE                 | 可实现；`kind` 能表达 label/folder 差异      |
| `listChanges(cursor)`             | account-level historyId   | per-folder deltaLink                | per-mailbox UIDVALIDITY/modseq/UID | cursor 内容可 opaque，但作用域与失效语义不足 |
| `listIdentities`（Service）       | sendAs                    | mailbox aliases                     | SMTP envelope/from 配置            | Adapter 缺少对应方法                         |
| `sendMessage`                     | API 返回 message          | sendMail 202 空 body                | SMTP accepted/rejected             | accepted 强制 message ID 不成立              |
| `moveMessage`                     | 增删 labels               | 创建新对象并删除旧对象              | MOVE 或 COPY+DELETE                | 返回新 ID 的设计正确                         |
| `getAttachment`                   | attachment API            | attachment API/raw MIME             | MIME part fetch                    | 可实现；stream 类型需在边界转换              |
| `pushNotifications`               | Pub/Sub watch             | Graph subscription/webhook          | IDLE                               | 布尔 capability 不足以管理生命周期           |

## 必须补齐的契约

以下 P0 项建议在开始具体 Provider 实现前完成：

1. **发送结果允许没有 Provider ID。** 将 accepted 分支改为 `providerMessageId?: string`，并可增加 `providerRequestId?: string`；本地 `MailSubmission.id` 与 `idempotencyKey` 才是可靠追踪键。不要把“API 已接受”解释为“邮件已投递”。
2. **把增量变化改为判别联合。** `deletedProviderMessageIds` 无法区分“全局删除”和“从当前文件夹移除”。至少表达 `upsert`、`removedFromFolder`、`deleted`，或者要求 Provider 在返回前额外解析为全局结果。Graph folder delta 与 IMAP mailbox scope 都需要这个区别。
3. **显式建模 cursor scope 和失效。** 建议 `MailSyncCheckpoint { scopeId, cursor }`，并在结果/错误中表达 `cursorInvalid`，触发受控全量同步。现有 `Record<string, string>` 能存多个 cursor，但没有稳定 scope 语义。
4. **增加核心持有的凭据解析器。** `createAdapter(context, config, account)` 只能看到 `credentialReference`，而 `MailProviderContext` 只有 `publicBaseUrl`，实际 SDK 无法安全获取、轮换、撤销 token。应给 context 提供 `MailCredentialResolver`，至少支持读取、版本化更新和删除；明文凭据不得进入 `MailAccount` 或公开 DTO。
5. **增加一次性 OAuth transaction store。** Google/Microsoft authorization-code + PKCE 需要在 `start` 与 `complete` 之间保存 `codeVerifier`、nonce、tenant/authority、scopes 等临时状态。callback 还需表达 `error` / `error_description`，并保证 state 只消费一次。
6. **定义 push subscription 生命周期。** Provider 扩展应覆盖 create/renew/delete、subscription ID、expiresAt、webhook challenge/verification 和通知归一化。通知处理只能 enqueue sync，`listChanges` 仍是数据真相。

随后可补 P1：

- Adapter 增加 `listIdentities()` / `listAliases()`，否则 `aliases: true` 没有实现入口。
- `MailProviderError` 增加可选 `providerCode`、HTTP status、request ID；已有 `retryAfterMs` 应承接 Graph/Gmail 限流信息。
- 对 Provider 能力增加可选结构化限制，例如最大消息大小、搜索、批量操作、延迟发送、ID 稳定性；首版仍可保留布尔值作为 feature gate。
- 考虑 `getRawMessage`（stream 或 blob reference），用于统一 MIME 解析、归档和排障。
- `MailMessage.html` 明确标注为不可信。展示层使用 [DOMPurify](https://github.com/cure53/DOMPurify) 等持续维护的 sanitizer，并默认阻止远程图片/跟踪像素；不应把第三方 MIME parser 的 HTML 直接渲染。

Node 邮件库通常返回 Node `Readable`，公共契约当前使用 WHATWG `ReadableStream`。Node 官方文档提供 [`Readable.toWeb` / `Readable.fromWeb`](https://nodejs.org/api/stream.html#streamreadabletowebstreamreadable-options) 转换；转换只能发生在 Adapter 边界，避免第三方流类型传播到 MailService。

## 存储与搜索建议

首版使用 NocoBase 自身能力，不增加 Elasticsearch/OpenSearch：

- 关系数据库保存账户、文件夹、消息 metadata、会话、submission、command、job、cursor 与 webhook subscription；本地 ID 与 Provider ID 分离，并对 `(accountId, providerMessageId)` 建唯一约束。
- raw MIME 与附件存入 NocoBase Drive/blob 层，数据库只保存 reference、hash、size、content type；不要把大附件或 base64 放进消息表。
- 维护 Provider ID alias/history，承接 Graph move、IMAP UIDVALIDITY 变化等 ID 变更；本地 message ID 保持稳定。
- 首版搜索只做数据库可索引的 subject、地址、时间、folder、read/starred 等 metadata。Provider 远程搜索可作为可选能力；本地正文全文检索以后抽象为 `MailSearchIndex` port，再接 PostgreSQL FTS 或 OpenSearch。
- sync commit 必须把消息变化与 checkpoint 原子提交；push/IDLE/Webhook 丢失或重复都不能破坏最终一致性。

这种拆分与 Stalwart 把 data、blob、full-text index 分离的[官方存储模型](https://stalw.art/docs/storage/backends/)一致，也避免首版引入新的运维组件。

## 推荐实施顺序

1. 先补齐上述 P0 契约、凭据与 OAuth transaction port，不安装协议 SDK。
2. 用 Gmail Provider 验证 account-level history、label、thread、draft、alias 与 Pub/Sub renewal。
3. 用 Microsoft Provider 验证 per-folder delta、无 Provider ID 的 202 send、move 后 ID 变化与 webhook subscription。
4. 用 Generic IMAP/SMTP Provider 验证 scoped UID、QRESYNC fallback、IDLE 重连、MIME/附件流。
5. 三个 Provider 都只依赖 Mail 核心契约；核心包保持零外部邮件协议依赖。
6. 完成互操作测试后，再评估 JMAP；EmailEngine/Nylas 仅在明确接受许可证、成本、数据出境与可用性约束时作为独立 Provider。

最终依赖边界应是：核心决定领域语义、持久化和任务一致性；Provider 决定认证、协议、游标解释与错误归一化；外部 SDK 永远是可替换的实现细节。
