# 通知管理 3.0 实现就绪规格

Label: wayfinder:map

## Destination

形成一份最小但完整的通知主干实现规格：系统调用方向显式接收者提交各 Channel 的最终内容，经 In-app/db 或 Email/SMTP 立即异步投递，并提供失败重试、固定顺序 Fallback、Delivery Log、用户 Inbox 与 WebSocket 实时更新。

## Notes

- 原始需求：[通知 3.0](../../packages/app-template-default/registry/notification/通知%203.0.md)。
- 领域词汇：[Notification Management](../../CONTEXT.md)。
- 每次处理地图时使用 `wayfinder`；涉及产品取舍时使用 `grilling` 与 `domain-modeling`；外部事实使用 `research`。
- 业务代码集中在 `packages/app-template-default/registry/notification`，目录外只允许应用入口、Header、独立 Live Provider、构建配置和依赖声明等必要接线。
- 通知后端在 Portal Hono 进程中自治运行，复用 App Runtime 注入的 `DatabaseManager`、`NocoBaseQueueManager` 与 Logger，并自行拥有 NotificationStore 领域 Adapter、Reconciler 和 Provider 执行能力；用户身份通过可替换 IdentityProvider 复用 NocoBase，正式 ACL 由后续专门模块接入。
- `server/services/index.ts` 临时直接 import 通知后端，`server/app.ts` 只负责挂载 Router，不建设通用 `AppServerExtension` 装载机制；`registry/portal-live` 独立提供同源 WebSocket、Refine LiveProvider 与 LivePublisher，通知模块不拥有实时传输。
- `NotificationStore` 保持领域化 Interface，但首期直接提供基于 `@nocobase/database` DatabaseManager 的生产 Adapter；通知领域不实现数据库方言，首期以 PostgreSQL 作为生产验收基线，其他数据库由共享 DatabaseManager/部署组件承接。
- 本地图只实现 In-app/db、Email/SMTP 和 Fake Provider；其他 Channel 与 Provider 不进入本期规格。
- Trigger 以 Notification 与 Delivery 可靠持久化为成功；多渠道独立投递，支持部分成功。
- Trigger 支持直接内容或开发者注册的内部模板；模板使用显式公共/逐 Recipient 变量并在触发时渲染，模块保存不可变内容快照，但不提供业务用户模板管理、多语言自动选择或手工发送能力。
- Recipient 只接受显式 NocoBase `userId` 或显式 Channel 地址，不提供筛选、动态解析、Topic、群组或订阅。
- 共享 `@nocobase/queue` 只分发立即发送的 `{ deliveryId }` Job；Delivery 仍是通知领域的持久化事实，Reconciler 补偿丢失或重复 Job，并保留 Worker、失败重试、超时恢复、固定 Fallback 与 Delivery/DeliveryAttempt 日志。Queue 内建 Retry、Delay 和 Dedup 不承担通知业务语义。
- 不提供延迟/定时发送、任务优先级、可配置多层并发、幂等 key 或去重逻辑。
- `registry/notification/providers` 保存受支持的 Provider Type 与实现；`registry/notification/config/providers.ts` 是首期 Provider Instance 的唯一真相源，凭证只通过环境变量或 Secret 引用解析，管理页不反向修改源码配置。
- 状态模型完整设计；一期可达 Delivery 状态为 `queued`、`sending`、`accepted`、`delivered`、`failed` 与 `submission_unknown`，不建设通用 Provider 回调系统，也不把 SMTP 的 `accepted` 解释为 `delivered`。
- 管理端只保留只读 Provider 配置/连接测试和 Delivery Log；用户端保留顶部铃铛、跨 Channel 通知中心页面与独立 Live Provider 实时更新，健康连接状态保持静默。
- Trigger 一期通过 Host 授予系统主体的内部 TypeScript API 向其他服务开放；浏览器 HTTP Trigger 在正式 ACL 接入前默认拦截，不提供业务用户手工发送界面。
- 一期交付完整可集成主干；管理后台在正式 ACL 接入前仍须通过临时访问策略可查看和操作，具体边界由公共 API 票据确定。每个独立模块必须提供面向集成方的使用文档。

## Decisions so far

<!-- 关闭票据后在此追加一行上下文指针；决定的完整内容只保存在对应票据。 -->

- [确定外部通知实现的借鉴与复用边界](issues/01-reuse-boundaries.md) — Provider Adapter 只负责已渲染消息的第三方交付与结果归一化，核心编排与公共 API 保持自有领域模型。
- [建立目标 Provider 的能力与回执矩阵](issues/03-provider-capability-matrix.md) — SMTP 同步成功只代表服务端接受，且没有标准送达回调，因此核心状态与日志不能把 `accepted` 解释为 `delivered`。
- [确定通知后端的构建与直接挂载契约](issues/04-server-build-mount-contract.md) — 临时由 `server/app.ts` 直接 import 异步通知模块，保持 AppHost 懒激活；运行时显式注入数据库与 LivePublisher，并以单一截止时间可靠关闭 Worker 和数据库。
- [确定通知、投递与尝试的完整生命周期](issues/05-notification-lifecycle.md) — Delivery 与 Attempt 分层记录投递，SMTP 不确定提交进入 `submission_unknown` 并停止自动处理；Notification 状态由 Delivery 派生，UserNotificationItem 按 userId Delivery 独立保存用户状态。
- [确定系统 Trigger、显式 Recipient 与内容快照契约](issues/06-trigger-recipient-contract.md) — Trigger 严格展开显式 User/Email Target，支持直接内容或开发者注册的 Liquid 模板逐 Recipient 渲染，并在全量预检后原子保存地址与内容快照。
- [确定 SMTP/Fake Provider Adapter、配置与 Fallback 契约](issues/07-provider-adapter-routing-contract.md) — Provider 实现与配置分离，配置文件是实例唯一真相源；固定错误矩阵驱动三次同实例重试、顺序 Fallback，并对 SMTP 不确定提交和 Worker 崩溃采取保守停止策略。
- [原型验证数据库队列、租约与恢复行为](issues/09-durable-queue-prototype.md) — Delivery 保持唯一持久化事实；2026-08-19 起工作唤醒复用共享 `@nocobase/queue` 的 sync/fake/redis/database Driver，不再实现通知专用 EventQueue，低频 Reconciler 继续保证最终恢复。
- [确定身份转译、ACL 与 Worker 服务身份契约](issues/10-identity-acl-service-auth.md) — 用户 API 通过 IdentityProvider 复用 NocoBase 会话；内部系统主体触发通知，受限 Resolver 只在 Trigger 阶段读取地址，Worker 不持有用户凭证；首期管理 API 临时允许所有已认证 Portal 用户访问，HTTP Trigger 仍禁用。
- [确定独立 Live Provider 与实时事件协议](issues/11-websocket-event-protocol.md) — `registry/portal-live` 通过 AppHost 最小 Upgrade seam 提供按应用和用户隔离的 Refine LiveProvider；短期内存重放配合 cursor、resync_required 与 HTTP 对账，通知事件只作为最小失效提示。
- [原型化通知管理后台信息架构](issues/12-admin-console-prototype.md) — 管理端只保留 Delivery Log 与只读 Providers；首屏用于筛选和定位，Attempt/快照/配置版本按需下钻，submission_unknown 使用独立风险确认；首期以临时已认证访问策略保证功能可用。
- [原型化顶部铃铛、Inbox 与实时恢复体验](issues/13-inbox-realtime-prototype.md) — Header 铃铛与完整通知中心共享缓存和未读数；服务端按 Channel 筛选，每个 userId Delivery 显示独立条目，显式操作才改变 Portal readAt，Live Event 只触发合并 HTTP 失效，健康连接状态保持静默。
- [确定审计、数据保留、脱敏与运维策略](issues/14-audit-retention-operations.md) — 本期不建通用审计、不做应用层字段加密且数据库默认不清理；Notification 保存系统发送来源，Delivery/Attempt/Event 构成投递账本，输出仍统一脱敏，并保留健康、核心指标和显式启用的批量清理 seam。
- [确定最小主干的一期验收契约](issues/15-release-acceptance-boundary.md) — 一期交付可集成的完整通知与 Live 主干，以显式外部依赖、可操作管理端、本地 SMTP、分层自动化测试和完整故障恢复场景验收；数据模型和公共 API/使用文档前置现均已解决。
- [确定通知存储 Schema、约束与迁移契约](issues/17-data-model-migration-contract.md) — UserNotificationItem 按 `Notification + userId + Channel` 独立建项；Delivery 承载唯一工作事实、租约和不可变快照；生产 Adapter 直接基于共享 DatabaseManager 与 migration 实现，通知领域仍只依赖 NotificationStore Interface。
- [确定公共 API、模块入口与使用文档契约](issues/18-public-api-documentation-contract.md) — 公共 TypeScript/HTTP/Live 接口、DTO、错误码和临时访问边界已固定；HTTP 不带版本且 Trigger 禁用，文档集中于 `registry/notification/docs/` 并由 Route Schema 生成 API 产物。

## Not yet specified

- None for the phase-one implementation boundary.

## Implementation slices

- Approved implementation order and acceptance criteria: [implementation/README.md](implementation/README.md).

## Out of scope

- [选择安全模板渲染与 HTML 清洗方案](issues/02-template-safety-options.md) — 面向业务用户或管理员的可编辑模板、不可信模板作者执行隔离与通用模板安全平台移出本期；内部开发者模板由 Trigger 契约覆盖。
- [确定模板发布、版本与渲染契约](issues/08-template-publication-contract.md) — 本期没有数据库模板、草稿、发布、历史版本选择或业务用户模板配置；内部模板随代码发布并在触发时快照化。
- [确定微信与钉钉的目标产品形态](issues/16-enterprise-channel-product-selection.md) — 本期只保留 In-app/db、Email/SMTP 与 Fake Provider。
- 延迟/定时发送、任务优先级、可配置多层并发、幂等 key 与去重逻辑。
- 用户筛选、动态 Recipient Resolver、Topic、群组、订阅及其成员管理。
- 声明式 Provider 路由；本期只使用同一 Channel 下的固定 ProviderInstance 顺序。
- Overview、模板管理、业务用户手工发送和独立 Queue 管理页面。
- 通用 Provider 回调系统；状态模型可预留完整语义，但本期不实现送达回执投影。
- 旧通知模块 API 或历史数据迁移。
- 一个通知进程同时服务多个 NocoBase 应用，以及通知领域内部独立租户模型。
- 任意 JavaScript 模板或用户提供的可执行路由脚本。
- 用户级 Channel 偏好、免打扰和营销订阅中心。
- 通用服务端 Registry 自动发现与装载机制。
- 独立分析仓库或实时数据仓库。
- 通用管理审计、审计查询与审计页面。
- 默认数据库保留期、默认物理清理和应用层字段加密；只保留未来显式配置的接入点。
- CI 中调用真实第三方 Provider。
