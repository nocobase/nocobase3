# 外部通知实现的借鉴与复用边界

研究日期：2026-08-17

## 结论

四个项目共同支持一个清晰边界：**Provider Adapter 只负责把已解析、已渲染的渠道消息交付给第三方并归一化结果；候选 Provider 选择、重试/Fallback、队列、模板、审计持久化和对外 Trigger API 都应由 Adapter 之外的模块拥有。**

通知管理 3.0 可以复用这些项目的分层事实和少量 MIT 源码实现思路，但不应把任一项目的类型原样提升为公共契约：Novu 的 `IEmailProvider`、`providerData/_passthrough` 与 Workflow Bridge，Notifme 的渠道请求对象和策略函数，Better-Notify 的 Catalog/Client 泛型与完整 core 导出面，以及 Laravel Auditing 的 Eloquent Contract/数据库列，都属于各自实现生态。

建议后续票据以 NocoBase 领域词汇定义两个独立边界：

1. 面向调用者的 Trigger/查询 API，只出现 `Notification`、`Recipient`、`Channel`、`Delivery` 等领域对象。
2. 面向扩展作者的 Provider Type SPI，输入为渠道规范化且已渲染的消息，输出为规范化发送结果或错误；`Provider Instance`、`Route Policy`、`Delivery Attempt` 和 `Delivery Status Event` 由核心运行时管理。

## 范围与证据快照

本报告只使用官方文档和官方仓库源代码。源码链接固定到研究时的提交，避免分支漂移。

| 项目 | 研究快照 | 在本研究中的用途 |
| --- | --- | --- |
| Novu | [`novuhq/novu@3f6bb54`](https://github.com/novuhq/novu/tree/3f6bb5488504386581be0004f88a2f34736084e1)，`@novu/providers` 2.6.6 | Provider Adapter、回执钩子、Workflow/Trigger 分层 |
| Notifme | [`notifme/notifme-sdk@bcc3b80`](https://github.com/notifme/notifme-sdk/tree/bcc3b807da2b5ab2d9459a96fbd9cac2f9e1d365)，1.16.25 | 极小 Provider 接口、多 Provider 策略、按渠道汇总结果 |
| Better-Notify | [`better-notify/better-notify@eb6748c`](https://github.com/better-notify/better-notify/tree/eb6748cbbebc97c9a3fc95fcbeb2925d9e80b6ff)，`@betternotify/core` 1.0.0-beta.10 | 渲染与传输分离、Pipeline、生命周期与多传输组合 |
| Laravel Auditing | [`owen-it/laravel-auditing@3f71364`](https://github.com/owen-it/laravel-auditing/tree/3f7136466b42c0745b2bb5288f06d929a37c9aab) | 审计模块目录、Driver/Resolver Contract、审计记录形状 |

版本和许可证来自各项目官方包清单：[`@novu/providers/package.json`](https://github.com/novuhq/novu/blob/3f6bb5488504386581be0004f88a2f34736084e1/packages/providers/package.json)、[`notifme-sdk/package.json`](https://github.com/notifme/notifme-sdk/blob/bcc3b807da2b5ab2d9459a96fbd9cac2f9e1d365/package.json)、[`@betternotify/core/package.json`](https://github.com/better-notify/better-notify/blob/eb6748cbbebc97c9a3fc95fcbeb2925d9e80b6ff/packages/core/package.json)、[`laravel-auditing/composer.json`](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/composer.json)。四者清单均声明 MIT；这只说明许可证事实，直接复制代码仍需保留相应版权与许可声明并经过项目的依赖/法务审查。

## 一手事实

### Novu

#### Provider Adapter

- Novu 把具体 Provider 放在独立 `packages/providers` 包中；例如 `ResendEmailProvider` 继承公共 `BaseProvider`、实现渠道接口，并公开 `id`、`channelType` 和 `sendMessage`。`sendMessage` 接受 Novu 统一的 email options，再转成 Resend SDK 请求，成功只归一化为 `id` 与 `date`。[Resend Adapter 源码](https://github.com/novuhq/novu/blob/3f6bb5488504386581be0004f88a2f34736084e1/packages/providers/src/lib/email/resend/resend.provider.ts)
- `BaseProvider.transform()` 明确处理第三方字段命名差异，并按“Trigger provider data < 已建模的 Bridge data < `_passthrough` 未知字段”的优先级合并 body/headers/query。[BaseProvider 源码](https://github.com/novuhq/novu/blob/3f6bb5488504386581be0004f88a2f34736084e1/packages/providers/src/base.provider.ts)
- 同一个具体 Adapter 还可承载 Provider 特有的回执能力。Resend Adapter 实现了消息 ID 提取、事件状态映射、签名验证和入站 Webhook 配置探测；这些能力并非 `sendMessage` 的必需输入输出。[Resend Adapter 回执实现](https://github.com/novuhq/novu/blob/3f6bb5488504386581be0004f88a2f34736084e1/packages/providers/src/lib/email/resend/resend.provider.ts)
- Worker 侧并不直接依赖某个 Provider SDK：mail handler 接口定义匹配、构建、发送、取 Provider 与检查能力，`MailFactory` 通过 Provider ID/Channel 选择 handler，再注入凭据和配置。[Mail handler 接口](https://github.com/novuhq/novu/blob/3f6bb5488504386581be0004f88a2f34736084e1/libs/application-generic/src/factories/mail/interfaces/index.ts)、[MailFactory 源码](https://github.com/novuhq/novu/blob/3f6bb5488504386581be0004f88a2f34736084e1/libs/application-generic/src/factories/mail/mail.factory.ts)

可复用事实：按 Channel 形成稳定的规范化输入；具体 Adapter 隔离 SDK、字段命名、凭据和回执解析；发送与可选回执能力可以属于同一 Provider Type 实现，但应是不同方法。

不可复用为公共 API：`IEmailOptions`/`IEmailProvider` 的原始类型、Provider 枚举、SDK 配置、`_passthrough` 合并规则和具体 Webhook body。特别是 `_passthrough` 允许未知字段覆盖已建模字段，适合受控的内部兼容逃生口，不适合跨版本公共契约。

#### 编排与 Trigger

- Novu 的 code-first `workflow()` 把 Workflow 定义、payload schema 验证、发现协议和远端 Trigger 分开；Trigger 请求包含 workflow 名称、recipient、payload，以及可选 transaction ID、overrides、actor、context、agent ID 和 Bridge URL。[Workflow resource 源码](https://github.com/novuhq/novu/blob/3f6bb5488504386581be0004f88a2f34736084e1/packages/framework/src/resources/workflow/workflow.resource.ts)
- Workflow 的 step 表面同时包含渠道步骤和 `digest`、`delay`、`throttle` 等动作步骤，说明编排能力位于 Provider Adapter 之上。[Workflow step discovery 源码](https://github.com/novuhq/novu/blob/3f6bb5488504386581be0004f88a2f34736084e1/packages/framework/src/resources/workflow/workflow.resource.ts)
- Novu 官方仓库将事件入口 DTO 放在 API 的 events 模块，而不是 provider 包；这从目录和依赖方向上支持“Trigger API 不等于 Provider API”。[Trigger DTO 源码](https://github.com/novuhq/novu/blob/3f6bb5488504386581be0004f88a2f34736084e1/apps/api/src/app/events/dtos/trigger-event-request.dto.ts)
- 邮件 Worker 用例拥有 integration 选择、variant/layout/template、Message 与 Execution Details 写入、handler 调用、Provider message ID 和失败状态更新，具体 Provider 不拥有这条生命周期。[SendMessageEmail 用例](https://github.com/novuhq/novu/blob/3f6bb5488504386581be0004f88a2f34736084e1/apps/worker/src/app/workflow/usecases/send-message/send-message-email.usecase.ts)

可复用事实：Schema 验证发生在编排入口；编排步骤和 Provider 执行是两个层次；业务 Trigger 通过稳定标识与 payload 调用，而不是直接构造第三方请求。

不可复用为公共 API：Novu 的 Subscriber/Tenant/Actor、Bridge URL、Workflow discovery、Step factory、overrides/provider data 等平台协议。通知管理 3.0 已有 `Recipient`、`Notification`、`Template Version` 和 `Route Policy`，应坚持自身词汇。

### Notifme

#### Provider 与策略

- Notifme 的内部 `ProviderType` 极小，只有 `id` 和 `send(request): Promise<string>`；渠道 factory 负责把配置实例化为 Provider，Provider 本身不拥有候选选择逻辑。[Provider factory 源码](https://github.com/notifme/notifme-sdk/blob/bcc3b807da2b5ab2d9459a96fbd9cac2f9e1d365/src/providers/index.js)
- `fallback` 策略位于独立 `strategies/providers` 目录，顺序调用 Provider；失败才尝试下一个，全部失败时把最后 Provider ID 附到异常上。[Fallback 策略源码](https://github.com/notifme/notifme-sdk/blob/bcc3b807da2b5ab2d9459a96fbd9cac2f9e1d365/src/strategies/providers/fallback.js)
- 官方 README 还定义 `fallback`、`roundrobin`、`no-fallback` 和自定义 `(Provider[]) => Sender` 策略，证明多 Provider 选择是可替换的编排函数，而非具体 Provider 的职责。[官方 README：Multi-provider strategies](https://github.com/notifme/notifme-sdk/blob/bcc3b807da2b5ab2d9459a96fbd9cac2f9e1d365/README.md#multi-provider-strategies)
- `Sender` 对请求中出现的渠道使用 `Promise.all` 并行发送，再汇总每个渠道的 Provider ID、消息 ID 和错误，因此一次逻辑请求可以得到渠道级部分失败信息。[Sender 源码](https://github.com/notifme/notifme-sdk/blob/bcc3b807da2b5ab2d9459a96fbd9cac2f9e1d365/src/sender.js)

可复用事实：Provider 执行与策略组合分离；Fallback 的候选顺序属于核心；多渠道应独立执行并保留逐渠道结果。

不可复用为公共 API：Notifme 只用字符串 ID 表示成功，错误通过动态修改 `error.providerId` 传播，无法表达临时、永久、限流或未知；这些形状不能成为 3.0 的 `Delivery Attempt` 结果契约。

#### 公共发送对象

- `NotifmeSdk` 的公共入口是 `send(NotificationRequestType)`；请求直接内嵌 email/SMS/push 等渠道请求，状态对象直接暴露 `providerId` 和渠道错误。[SDK 入口源码](https://github.com/notifme/notifme-sdk/blob/bcc3b807da2b5ab2d9459a96fbd9cac2f9e1d365/src/index.js)
- 渠道请求类型混入大量 Provider/平台字段，并允许 `customize(providerId, request)` 在调用时按 Provider 改写请求。[Notification request 模型](https://github.com/notifme/notifme-sdk/blob/bcc3b807da2b5ab2d9459a96fbd9cac2f9e1d365/src/models/notification-request.js)

可复用事实：统一入口可以接受多渠道意图，并返回逐渠道结果。

不可复用为公共 API：把已渲染内容、第三方字段、Provider ID 和 Provider 条件分支放进 Trigger 请求，会绕过 `Template Version`、`Route Policy` 与审计模型；`customize` 还是用户提供的可执行策略，与 3.0 明确排除任意路由脚本冲突。

### Better-Notify

#### Channel、Route、Transport 与 Client 分层

- 官方文档明确区分四件事：Channel 定义消息形状和渲染，Route 定义某个通知的输入与渲染契约，Transport 只接收已验证且已渲染的消息并完成交付，Client 按 Channel 把 Catalog 接到 Transport。[官方架构说明](https://better-notify.com/docs/)
- Transport 的稳定形状是 `name`、`send(rendered, ctx)`，以及可选 `verify()`/`close()`；发送返回 `{ ok: true, data } | { ok: false, error }`。[官方 Transport 文档](https://better-notify.com/docs/transports/)、[Transport 源码](https://github.com/better-notify/better-notify/blob/eb6748cbbebc97c9a3fc95fcbeb2925d9e80b6ff/packages/core/src/transport.ts)
- 核心 Pipeline 的顺序是参数/Schema 验证、middleware、render、transport send，并为 validate/middleware/render/send/hook 标识错误阶段；观察性 hook 与能改变控制流的 middleware 被明确区分。[Pipeline 源码](https://github.com/better-notify/better-notify/blob/eb6748cbbebc97c9a3fc95fcbeb2925d9e80b6ff/packages/core/src/pipeline.ts)

可复用事实：Adapter 应接收已渲染消息；启动校验与优雅关闭是可选生命周期；观察事件不能代替控制流策略；错误至少需要保留发生阶段。

不可复用为公共 API：Better-Notify 的 Route/Catalog/Client 是面向代码内类型推导的库 API，而 3.0 的 Template、Route Policy 和 Provider Instance 是持久化的管理对象。直接公开其泛型会把实现语言、模板库和 package layout 固化进业务 API。

#### 多 Transport 编排

- `multiTransport` 支持 failover、round-robin、random、race、parallel、mirrored 等组合；类型说明还把逐 Provider 尝试次数、退避和 `isRetriable` 判定放在 composite 中，而非叶子 Transport。[Multi-transport 类型源码](https://github.com/better-notify/better-notify/blob/eb6748cbbebc97c9a3fc95fcbeb2925d9e80b6ff/packages/core/src/transports/multi.types.ts)
- 官方文档明确区分 HTTP request retry、跨 Provider multi-transport retry 与整条 Pipeline 的 queue retry，三者作用域不同。[官方 Transport 文档：Retry 层次](https://better-notify.com/docs/transports/#retry-vs-multi-transport-vs-queue-retry)

可复用事实：同 Provider 网络重试、跨 Provider Fallback 和任务级重试必须是三个不同决策层；编排需要拿到规范化错误分类才能决定下一步。

不可复用为公共 API：这些策略名称和参数只是一个库的组合器 API。3.0 应把它们映射为声明式 `Route Policy`、Worker retry policy 与并发策略，不能让调用者传函数或直接选择 race/mirrored 等执行细节。

此外，研究快照中的 `@betternotify/core` 是 `1.0.0-beta.10`。[官方 package.json](https://github.com/better-notify/better-notify/blob/eb6748cbbebc97c9a3fc95fcbeb2925d9e80b6ff/packages/core/package.json) 因此其设计可作为分层证据，但不应在缺少独立兼容性评估时成为 3.0 的核心运行时依赖或公共类型来源。

### Laravel Auditing

#### 可复用的目录与职责

官方仓库把审计能力拆成顶层配置/迁移与 `src` 内的职责目录：

```text
config/audit.php
database/migrations/audits.stub
src/
  Contracts/
  Drivers/
  Encoders/
  Events/
  Listeners/
  Models/
  Redactors/
  Resolvers/
  Audit.php
  Auditable.php
  Auditor.php
  AuditableObserver.php
```

该结构可由官方固定提交的 [`src` 目录](https://github.com/owen-it/laravel-auditing/tree/3f7136466b42c0745b2bb5288f06d929a37c9aab/src)、[`config/audit.php`](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/config/audit.php) 和 [`database/migrations/audits.stub`](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/database/migrations/audits.stub) 核验。

- `Contracts/AuditDriver` 只定义 `audit()` 与 `prune()`；默认 `Drivers/Database` 负责落库和阈值裁剪。[AuditDriver Contract](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/src/Contracts/AuditDriver.php)、[Database Driver](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/src/Drivers/Database.php)
- `Contracts/Resolver` 把请求/环境上下文解析为审计字段；配置将 IP、User-Agent、URL 分别绑定到 Resolver 实现。[Resolver Contract](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/src/Contracts/Resolver.php)、[官方配置](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/config/audit.php)
- `Auditor` 编排 ready check、前置可取消事件、空变更过滤、Driver 持久化、裁剪与完成事件，说明审计协调器不等于存储 Driver。[Auditor 源码](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/src/Auditor.php)

可复用事实：`contracts`、`drivers`、`resolvers`、`events`、`models` 分开；上下文补全、脱敏/编码、持久化、保留裁剪和事件发布是不同职责；数据库只是一个 Driver。

建议 3.0 在通知模块内部采用同样的职责分区，而不是复制 PHP 类名：审计 Contract/record model、context resolver、redaction/encoding、persistence/retention driver、domain events 分目录。由于 3.0 已决定 SQLite/PostgreSQL 可替换持久化，Driver 应依赖领域审计记录，而不是 ORM model。

#### 审计记录事实

- 默认迁移保存 actor 的多态类型/ID、event、auditable 类型/ID、old/new values、URL、IP、User-Agent、tags 和时间戳。[官方审计迁移](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/database/migrations/audits.stub)
- 配置独立控制事件集合、全局排除、空值、数组值、时间戳、每对象阈值、Driver、队列和 console auditing。[官方审计配置](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/config/audit.php)
- 公共 `Audit` Contract 提供元数据和 modified attributes 的读取，而 `Auditable` Contract 暴露 ORM relation、include/exclude、transform、tag 和状态回放等 Laravel/Eloquent 能力。[Audit Contract](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/src/Contracts/Audit.php)、[Auditable Contract](https://github.com/owen-it/laravel-auditing/blob/3f7136466b42c0745b2bb5288f06d929a37c9aab/src/Contracts/Auditable.php)

可复用事实：审计记录应同时包含“谁、何时、对什么对象、发生什么事件、前后变化/结果、请求上下文和标签”；采集与保留策略应配置化。

不可复用为公共 API：Eloquent morph relation、静态 Resolver、old/new JSON 列、状态回放、阈值裁剪算法和 Laravel events 都是实现细节。通知 3.0 还需要 `Notification`、`Delivery`、`Delivery Attempt`、`Delivery Status Event` 的专有标识与状态语义，不能用一个通用 `auditable_type/auditable_id` 对外替代。

还必须区分两套记录：Laravel Auditing 的证据支持“谁修改了 Provider Instance、Template Version、Route Policy”等配置治理审计；它不等于运行时投递账本。Worker 的每次 `Delivery Attempt`、Provider response 与异步回执必须由通知领域显式持久化，不能依赖 ORM observer 自动产生。

## 对通知管理 3.0 的边界建议

### 1. Provider Type SPI

以下是从证据推导出的最小职责集合，不是照搬任何一个项目的 API：

- 静态描述：稳定 `providerType`、支持的 `Channel`、能力标志和配置 Schema。
- 配置处理：验证 Provider Instance 配置、生成可展示的脱敏摘要；凭据值只进入受控执行实例。
- 执行：接收 `Delivery Attempt` 上下文与渠道规范化的已渲染消息，返回规范化 Provider message ID、接受时间和可审计的安全元数据。
- 生命周期：可选 `verify`/health check 和 `close`。
- 回执：按能力可选签名验证、Provider message ID 提取和 Provider 状态到内部 `Delivery Status Event` 的映射。
- 错误：输出 3.0 自有错误分类和安全细节；原始 SDK error/response 只能作为受限、可脱敏、可过期的内部诊断数据。

Adapter 不负责：读取模板、解析 Recipient、选择 Provider Instance、同 Provider 重试、跨 Provider Fallback、并发/速率限制、创建队列任务、修改 Delivery 最终状态或直接写审计表。

### 2. 编排边界

| 决策 | 所属层 | 证据来源 |
| --- | --- | --- |
| 参数/Schema 验证、模板选择与渲染 | Trigger/Application + Template | Novu Workflow；Better-Notify Pipeline |
| 每个 Recipient × Channel 建立独立 Delivery | Notification 核心 | Notifme 按渠道独立结果仅证明独立性；具体持久化语义由 3.0 自定 |
| Provider Instance 候选和顺序 | Route Policy | Notifme strategy；Better-Notify multi-transport |
| 单 Provider 瞬时重试 | Worker/attempt policy | Better-Notify retry 层次 |
| 跨 Provider Fallback | Route orchestrator | Notifme fallback；Better-Notify multi-transport |
| 第三方字段转换、SDK 调用 | Provider Adapter | Novu Provider；Better-Notify Transport |
| 回执验证与状态映射 | Provider receipt capability + receipt service | Novu Resend Adapter |
| 审计采集、存储、裁剪 | Audit coordinator + Driver | Laravel Auditing |

这意味着 `Route Policy` 应是持久化、声明式、可审计的核心配置，而不是 Adapter 参数、Notifme 风格策略函数或 Better-Notify `multiTransport()` 对象。

### 3. 公共 API 应暴露什么

面向业务调用者：稳定的 Trigger 标识、Recipient、模板/locale 参数、业务 payload、Channel 意图、触发来源和幂等键；响应使用 Notification/Delivery 标识与持久化接受结果。Provider Instance 的选择结果属于后续 Delivery/Attempt 查询，不应要求业务调用者传第三方请求。

面向管理端：Provider Type 的安全描述和配置 Schema、Provider Instance 的非敏感状态、Route Policy 声明、Delivery/Attempt/Status Event 的规范化视图。凭据、SDK 对象、原始 Webhook、原始错误堆栈和未脱敏 Provider response 不进入通用资源 DTO。

面向 Provider 扩展作者：只公开版本化 SPI、渠道规范化消息、能力接口、规范化结果/错误以及受控上下文；不要公开核心数据库 model、queue job、ORM transaction 或 HTTP controller DTO。

### 4. 明确不进入公共契约的外部形状

| 外部形状 | 不进入的原因 |
| --- | --- |
| Novu `I*Provider`、Provider enums、Bridge/Workflow discovery、`_passthrough` | 绑定 Novu 平台词汇、共享包和未知字段覆盖语义 |
| Novu/第三方具体 webhook body、SDK response | Provider 会变化，只能由 Adapter 解析后映射 |
| Notifme `NotificationRequestType`、`customize()`、策略函数、动态 `error.providerId` | 混合业务意图、渲染结果、Provider 分支与不稳定错误 |
| Better-Notify Catalog/Route/Client 泛型、全量 core export、multiTransport 配置 | 绑定代码内 TypeScript DSL，替代了 3.0 的持久化模型 |
| Laravel `Audit`/`Auditable` Eloquent Contract、morph relation、迁移列名 | 绑定 PHP ORM 与通用对象审计模型 |
| 任一项目的 Provider ID、Channel enum 或错误文本 | 不能保证与 3.0 的稳定标识、错误分类和本地化语义一致 |

## 已知未知与后续票据输入

以下内容没有被本研究中的一手资料共同定义，不能因为外部项目“看起来支持”就写入 3.0 契约：

- 临时、永久、限流、未知错误的准确判定规则，以及各 Provider 的逐项错误映射；交由票据 03/07。
- 幂等键、任务级重试、并发上限、故障恢复和 exactly-once/at-least-once 语义；交由票据 07/09。
- 回执乱序、重复、未知 message ID 和状态单调性；交由票据 05/07。
- 审计数据的字段级加密、脱敏规则、访问控制和具体保留周期；Laravel Auditing 只证明职责可分离，不能给出 3.0 的合规策略；交由票据 10/14。
- 是否直接依赖或复制 Novu/Notifme/Better-Notify 源码。当前证据只足以支持设计复用；依赖兼容性、供应链、维护活跃度和许可证通知需单独评估。

## 最终复用判定

| 项目 | 可借鉴/复用 | 不应复用为 3.0 公共契约 |
| --- | --- | --- |
| Novu | 渠道 Adapter、第三方字段映射、可选回执能力、Workflow 与 Provider 分层 | Novu Provider/Workflow/Bridge 类型、passthrough、Subscriber/Tenant 词汇 |
| Notifme | 极小 Provider 接口、策略与 Provider 分离、跨渠道独立结果 | 渠道大 DTO、可执行 customize/strategy、字符串/动态异常结果 |
| Better-Notify | 已渲染消息 Transport、验证→渲染→发送 Pipeline、生命周期、retry 层次 | Catalog/Client DSL、beta core 类型、multiTransport 配置直接外露 |
| Laravel Auditing | contracts/drivers/resolvers/events/models 分区、上下文采集、可替换存储/裁剪 | Eloquent Contract、morph schema、通用审计 API 代替通知领域模型 |
