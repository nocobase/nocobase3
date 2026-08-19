# 确定公共 API、模块入口与使用文档契约

Type: grilling
Status: resolved
Assignee: codex
Blocked by: 06, 10, 11, 15

## Question

通知模块、Provider、Event Queue 与 Portal Live Runtime 分别向集成方公开哪些稳定 TypeScript 入口和 HTTP/WebSocket API；Trigger、Delivery 查询与人工重试、Provider 查询与连接测试、Inbox 查询与写操作、Health、Live 订阅使用什么请求响应 Schema、分页、过滤、错误码和版本策略；在正式 ACL 尚未接入时，管理功能如何临时可见且可操作而 HTTP Trigger 仍保持关闭；每个模块必须生成哪些使用文档、配置示例和集成示例？

## Working decisions

- 稳定 TypeScript 入口限于通知模块构造与 Trigger Service、Provider Adapter、NotificationStore/Contract Test，以及 Portal Live 的 Server、Client 和协议；Queue 直接使用 `@nocobase/queue` 的公共 Interface，不再导出通知专用 EventQueue。Dispatcher、Reconciler、内部 Repository、状态机写接口与 Hono Handler不公开。
- `createNotificationModule()` 返回统一生命周期句柄，包含 `service/router/health/start/close`；构造负责校验装配，start 启动后台循环，close 使用共享 Promise 幂等关闭。
- HTTP 保持 `/<app>/api/notifications/*`，内部 Router 看到 `/api/notifications/*`，不增加 `/v1`。HTTP 兼容性随 Portal 应用发布管理；独立 Live 长连接继续用 `protocolVersion` 协商协议。
- 正式 ACL 接入前，所有已认证 Portal 用户可查看和操作 Delivery Log、人工重试、Provider 列表和连接测试，未认证返回 401；HTTP Trigger 仍固定返回 `403 HTTP_TRIGGER_DISABLED`，同进程服务使用 TypeScript Trigger。
- Delivery Log 与 User Notification Item 列表统一使用 page/pageSize 普通分页，默认 20、最大 100，固定 `createdAt DESC, id DESC`，不开放任意排序。
- HTTP 错误统一为包含稳定 code、可展示 message、requestId 和可选 issues 的信封；Live 复用错误码但通过事件信封传输。所有输出继续执行既定脱敏规则。
- 所有通知及 Live 相关文档集中在 `registry/notification/docs/`，按 notification、providers、queue-integration、store、config 和 portal-live 子目录分区；根 README 只链接文档入口。文档必须包含集成、配置、生命周期、API/协议、错误码、限制、可编译 TypeScript 示例和临时边界说明。
- Notification/Delivery 管理接口为 Notification 详情、Delivery 列表、Delivery 详情和单条人工重试；Delivery Log 只开放状态、Channel、Provider Instance、来源、Notification ID、Recipient 精确值、错误分类、创建时间与普通分页筛选，不支持任意 JSON、全文检索或自定义排序。
- Delivery 列表只返回脱敏地址和内容摘要；详情仍脱敏地址，但可返回已校验/清洗的最终 Channel 内容、版本化 Provider metadata、Attempt、StatusEvent 和 Chain Snapshot；绝不返回原始变量、未清洗 HTML、凭证、SMTP 会话或原始 Provider 响应。
- 人工重试请求必须提供 reason；submission_unknown 额外要求 `acknowledgeDuplicateRisk: true`。非 failed/unknown 状态返回 `409 DELIVERY_NOT_RETRYABLE`，并发重试由状态 CAS 仲裁。
- Provider HTTP 只提供只读列表和连接测试；测试 SMTP 连接、TLS 与认证但不发送真实邮件。配置仍以源码配置为唯一真相源，不提供 HTTP CRUD 或凭证读取。
- Inbox HTTP 提供列表、未读数、单条 read/unread/delete 和按可选 Channel 条件 read-all；userId 只来自 Principal，跨用户访问统一表现为 ITEM_NOT_FOUND，每个条目只有一个 Channel。
- 通知模块不提供独立 HTTP Health 路由，只保留 TypeScript `health()` 供 Host 汇总与部署基础层暴露。
- 同进程系统调用方可通过 TypeScript 查询 Notification；HTTP Notification 详情使用同一输出 Schema，仅返回来源、汇总和 Delivery ID/Channel/状态，不返回内容或地址。
- HTTP 路径不版本化；同一 Portal 发布内只兼容增加字段，破坏性变更必须随明确的 Portal breaking release。客户端忽略未知字段；Live 仍使用 protocolVersion 拒绝不兼容长连接客户端。
- Notification 详情返回来源、可信触发主体、汇总状态、时间和 Delivery ID/Channel/状态摘要；Delivery 列表 DTO 返回脱敏 Recipient、当前/末次 Provider、Attempt 数量、脱敏错误和时间，详情再增加快照、Chain、Attempts 与 StatusEvents。
- Inbox DTO 将 In-app title/body/actionUrl 或 Email subject/text 映射为统一 `display.title/body/actionUrl`；普通用户 API 不返回 Email HTML、Delivery 状态、地址或 Provider 信息。
- 公共错误码固定为通用解析、认证、权限、缺失、冲突、大小、校验、不可用和内部错误，加上 Trigger 禁用、Notification/Delivery/Provider/Item/Template/Recipient/Render/Channel 等稳定领域码；内部 Provider Error 不直接成为公共 HTTP Error Code。
- HTTP 成功使用 200/201；解析、认证、禁用、缺失、冲突、大小、领域校验、依赖不可用和未知异常分别映射 400/401/403/404/409/413/422/503/500。
- LivePublisher 由服务端调用方指定 user audience、逻辑 Channel、Type 与最小 ID payload；Live Runtime 根据 AppScope 补齐 app、stream、event、sequence 和时间。通知只发布 created/updated/deleted/unread-count-changed 失效提示。
- HTTP Route 的运行时 Schema 同源生成 OpenAPI JSON、HTTP Markdown、示例与错误码表；生成物提交仓库、禁止手改并由 CI 重生成检查漂移。非 HTTP 模块在集中 docs 目录的对应分区维护 API Reference 和可编译示例。
- Cookie 会话的所有状态 Mutation 执行 CSRF 校验，Bearer 身份不执行 CSRF，GET 不改变状态。
- HTTP Trigger 在一期无论请求是否认证都直接返回相同的 `403 HTTP_TRIGGER_DISABLED`，且不解析 Body、不解析 Recipient、不渲染模板、不访问数据库。
- 内部 Trigger 必须独立传入 Host 创建的 `{ kind: 'service', serviceId }` SystemPrincipal；业务 `source` 解释发送原因，Principal 解释可信调用者，两者不能互相替代。
- Portal Live 客户端通过 `createPortalLiveProvider()` 构造 Refine LiveProvider；Cookie 模式无需 Token 回调，Bearer 模式在每次重连重新获取 Token，重连、心跳、cursor 与重放由模块内部处理。客户端不能 publish。
- 一期不提供独立 Notification HTTP SDK，只导出运行时 Schema 与 TypeScript DTO；Portal 前端使用现有请求基础设施，外部系统使用 OpenAPI。
- 文档中的临时直接 import、内存 Adapter、临时管理访问、HTTP Trigger 禁用、单实例 Live、无 delivered 回执及范围删减必须使用统一的 TEMPORARY 标记，并写明正式装载、数据库、ACL、跨实例 Bus 或 Provider 回执能力接入后的移除条件。

## Answer

### 稳定模块入口

- `notification/server` 公开 `createNotificationModule()`，返回包含 `service/router/health/start/close` 的幂等生命周期句柄；`notification/service` 公开内部 Trigger 与 Notification 查询。
- `notification/providers`、`notification/event-queue`、`notification/store` 分别公开可替换 Adapter Port；Store 同时公开 Adapter Contract Test。Dispatcher、Reconciler、内部 Repository、状态机写入和 Hono Handler 不公开。
- `portal-live/server` 公开 Live Runtime 与 LivePublisher，`portal-live/client` 公开 Refine LiveProvider 构造器，协议类型保持独立。客户端仅 subscribe/unsubscribe，领域服务通过可信 LivePublisher 发布。
- 内部 Trigger 的 SystemPrincipal 与业务 input 分离并强制必传；一期不提供单独 HTTP SDK。

### HTTP 与访问边界

- 路径保持 `/<app>/api/notifications/*`，不增加 URL 版本。HTTP 兼容性随 Portal release 管理；同一 release 内只向后兼容增加字段。Live 继续使用协议版本协商。
- HTTP Trigger 注册契约但所有请求直接返回 `403 HTTP_TRIGGER_DISABLED`，不认证、不解析 Body、不访问任何业务依赖。同进程服务通过 TypeScript Trigger 调用。
- 正式 ACL 缺失期间，Delivery Log、人工重试、Provider 列表和连接测试对所有已认证 Portal 用户开放；Cookie Mutation 必须校验 CSRF，Bearer 不受 CSRF 约束。通知模块不提供 HTTP Health，由 Host 调用 TypeScript `health()` 后统一暴露。
- 管理接口包含 Notification 详情、Delivery 列表/详情/单条重试以及 Provider 列表/连接测试；Inbox 包含列表、未读数、单条 read/unread/delete 和带可选 Channel 条件的 read-all。分页统一 page/pageSize，固定创建时间和 ID 倒序，不开放任意排序或通用全文/JSON 查询。

### Schema、错误与 Live

- Notification、Delivery、Inbox 使用固定 DTO；Inbox 把各 Channel 内容映射成统一 display，并且每个 UserNotificationItem 只有一个 Channel。Delivery 列表轻量且脱敏，详情才返回已验证/清洗内容、Chain、Attempts 和 StatusEvents。
- 所有错误使用稳定 code、message、requestId 和可选 issues 信封，按 400/401/403/404/409/413/422/503/500 映射；Provider 内部错误分类不直接泄漏为公共 API Code。
- LivePublisher 只接受可信 user audience、逻辑 Channel、事件 Type 与最小 ID payload；Runtime 补齐 app、stream、sequence、event 和时间。通知只发送 created/updated/deleted/unread-count-changed 失效提示，HTTP/数据库仍是真相源。

### 文档交付

- 所有文档集中在 `registry/notification/docs/`，按 notification、providers、event-queue、store、config 和 portal-live 分区。Route Schema 同时驱动运行时校验、OpenAPI、Markdown、示例与错误码表；生成物提交并由 CI 检查漂移。
- 文档必须提供可编译 TypeScript 示例，并用统一 TEMPORARY 标记当前直接 import、内存实现、临时访问和可靠性边界；每个标记写明替代模块接入后的删除条件。
