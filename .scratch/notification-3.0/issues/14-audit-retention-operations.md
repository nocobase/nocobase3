# 确定审计、数据保留、脱敏与运维策略

Type: grilling
Status: resolved
Assignee: codex
Blocked by: 05, 10

## Question

Provider 配置变更审计与运行时 DeliveryAttempt 投递账本如何分离；Notification 内容、地址快照、SMTP 响应和管理操作分别保留多久；哪些字段必须加密、脱敏或禁止记录；健康检查、失败/积压提示和清理任务的最低标准是什么？

## Answer

本期进一步缩减为投递账本、输出脱敏和最低运维能力，不建设通用审计、默认数据保留或应用层字段加密。

### 投递账本与发送来源

- 不创建 `AdminAuditEvent`，不提供审计查询或审计页面。Provider 连接测试、配置装载和权限拒绝只写普通脱敏运行日志。
- Delivery、DeliveryAttempt 与 DeliveryStatusEvent 继续构成投递账本。人工重投的系统/用户 Principal、原因、风险确认和时间保存在对应 StatusEvent metadata 中，因为这些字段用于解释 Delivery 状态变化，不扩展成通用审计平台。
- 发送来源只在父级 Notification 保存一次：`source.type`、可选 `source.referenceId`、系统 `principal.service` 和 triggeredAt。Delivery Log 查询时关联 Notification 展示来源；Delivery 和 Attempt 不重复复制这些字段。
- `source.type` 是稳定、低基数的开发者机器标识；`source.referenceId` 是业务追踪 ID，不承担幂等语义。首期两者均明文保存，不做应用层加密，普通列表仍可按产品需要进行截断或脱敏展示。

### 数据保留与可选清理

- 首期数据库默认不自动清理 Notification、Delivery、Attempt、StatusEvent、Recipient/Content Snapshot 或用户通知中心记录，即保留期未配置时无限保留。用户删除只设置 deletedAt，默认不做后台物理删除。
- 不采用内置的 30/180/365 天默认期限。配置只预留显式 `retention` 规则；只有部署方主动启用并为具体数据集设置 maxAgeDays 后，清理任务才有删除行为。
- 清理执行器在启用规则时于 Portal 激活后运行一次，并每 24 小时运行；每批最多 500 条，使用数据库租约避免多实例重复。无规则时不启动或保持 no-op，不得隐式套用默认期限。
- queued、sending、仍允许人工处理的 failed 和 submission_unknown 永远不受普通终态清理规则影响。只有显式规则允许且已不可再处理时才能清除 Recipient/Content Snapshot；快照一旦清理，人工重投永久禁用并返回 `snapshot_expired`。
- 清理顺序为敏感快照和已软删除用户项，再到 StatusEvent/Attempt、Delivery，最后是没有子记录的 Notification；任一批失败不阻止投递，下周期继续。

### 数据存储与输出边界

- 首期 Email 地址、source.referenceId、标题、正文、HTML、模板变量和内容快照均按数据库普通字段保存，不实现应用层加密、keyId、HMAC 搜索或密钥轮换。
- Provider 凭证仍不得写入数据库或源码明文，只保存环境变量/Secret 引用；HTTP API 永远不返回 Secret 明文。
- “数据库不加密”不表示允许泄露到输出。普通日志、错误、StatusEvent 诊断和 Live Event 禁止记录或返回 Token、Cookie、CSRF、SMTP 密码、连接字符串、完整内容/变量、SMTP 会话、邮件 Header、Provider 原始请求/响应体或未经清洗的异常对象。管理详情可以按公共 API 契约返回已验证/清洗的最终 Channel 内容，但不得返回原始变量或未清洗 HTML。
- Delivery Log 默认返回脱敏 Recipient；详情返回归一化错误、耗时、ProviderInstance、configRevision、允许公开的外部消息 ID及已验证/清洗内容。中央 Redactor 统一处理 Adapter 错误，Adapter 不得自由序列化第三方异常。

### 健康、指标与可观测性边界

- 通知模块只提供 TypeScript `health()`，由 AppHost 或部署基础层统一聚合和按自身策略暴露；通知 Router 不注册独立 HTTP Health。健康结果覆盖数据库、migration、Dispatcher、Reconciler、共享 QueueManager/Worker、LivePublisher、Provider 配置和可选清理任务。
- 数据库不可用、migration 不一致或 Dispatcher 未运行为 unavailable。SMTP 网络不可用只使对应 Provider degraded，不影响 Portal readiness；submission_unknown 是运营 attention，不使 readiness 失败。
- 最低指标包括：已到期 queued 数量和最老等待时间、sending 与过期 lease、failed/submission_unknown 数量、Attempt 结果和耗时、Retry/Fallback 次数、Reconciler 上次成功与扫描量、Queue dispatch/LivePublisher 发布失败，以及启用时的清理任务结果。
- 指标标签只允许 Channel、ProviderInstance、状态和归一化错误码等有限集合；禁止 userId、Notification/Delivery ID、地址、内容和 source.referenceId 等高基数或敏感标签。
- 一期只定义 `NotificationTelemetry` Port，并提供结构化日志、健康 JSON 和进程内指标快照；不实现 Prometheus Server、告警通知、运维仪表盘或长期指标数据库。
