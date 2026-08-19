# 确定 SMTP/Fake Provider Adapter、配置与 Fallback 契约

Type: grilling
Status: resolved
Blocked by: 01, 03

## Question

SMTP 与 Fake ProviderType Adapter 应暴露哪些稳定能力；`registry/notification/config` 中的 Provider 配置描述文件如何定义字段、默认值、校验与管理表单；ProviderInstance 如何按固定顺序组成 Provider Chain；发送结果和错误怎样标准化为临时、永久或未知，并区分同 Provider 重试、跨 Provider Fallback 与数据库任务恢复？

## Answer

### 代码与配置边界

- `registry/notification/providers` 保存受支持的 Provider Type、Adapter 实现、配置 Schema 与 Provider 原始错误映射。首期实现 SMTP 与 Fake；In-app/db 由通知领域在同一数据库事务中使对应 UserNotificationItem 可见，不经过外部网络 Adapter。
- SMTP/Fake Adapter 只暴露 `checkConnection()`、单次 `send()` 和可选的幂等 `close()`。Adapter 不读写 Notification、Delivery、Attempt 或队列表，不决定 Retry、Fallback 和状态转换。
- `send()` 返回严格联合结果：`accepted`、带归一化错误的 `failed` 或 `submission_unknown`。Adapter 抛出的意外异常必须在边界转换为归一化内部错误，不能穿透 Worker。
- `registry/notification/config/providers.ts` 是首期 ProviderInstance 的唯一真相源，按 Channel、Provider Type 和实例名组织配置；稳定实例标识形如 `email/smtp/primary`。配置定义启停、固定顺序与实例化参数。
- 凭证只能通过环境变量或 Secret Resolver 引用，不能把明文密钥提交到仓库。Provider 管理页不反向修改源码配置，只展示脱敏的有效配置、启停状态、顺序和连接测试结果。

### 装载、校验与版本

- Portal 每次激活只加载一次配置，运行期间不热更新；配置变化通过重新激活或重启生效。
- 启动时校验所有实例的结构、稳定 ID、Channel、Provider Type、顺序和唯一性。只对启用实例解析 Secret 并创建 Adapter；启用实例缺少 Secret 或配置非法会使通知模块激活失败，禁用实例允许暂时缺少 Secret。
- 初始化不访问 SMTP 网络，避免外部邮件服务器短暂故障阻止 Portal 启动；网络检查只发生在显式 `checkConnection()` 或实际发送中。
- 每份有效实例配置生成不泄露 Secret 的 `configRevision`。Trigger 快照当时启用的有序 ProviderInstance ID；Worker 使用实例执行时的当前配置，每个 Attempt 保存实际 `configRevision`。排序变化只影响新 Delivery。
- 已快照但执行时被禁用或不存在的实例不创建 Attempt，而是追加 `provider_skipped` 状态事件并继续 Chain；全部实例不可用时以 `no_available_provider` 进入 `failed`。

### 错误阶段与自动处理

- 初始化错误包括未知 Provider Type、实例标识重复、配置非法、Secret 不可用和 Adapter 创建失败，并阻止通知模块激活。
- 连接测试错误只返回管理 API 并写入管理员审计，不创建 Notification、Delivery 或 Attempt。
- 发送错误写入 Attempt，并归一化为认证、授权、请求非法、Recipient 非法、限流、Provider 不可用、网络错误、超时、提交未知或内部错误。日志、API 和审计必须脱敏。
- Recipient 或请求永久错误直接进入 `failed`，不 Retry、不 Fallback。认证或授权错误不重试当前实例，立即 Fallback。限流、Provider 不可用、明确尚未提交的网络错误与 Adapter 内部错误先重试当前实例，耗尽后 Fallback。
- 每个 ProviderInstance 最多三次 Attempt：第一次失败后等待 30 秒，第二次失败后等待 2 分钟，第三次仍失败则切换到 Chain 中下一个实例。内部 `nextRunAt` 只服务失败恢复，不向 Trigger 暴露延迟或定时发送能力。
- `submission_unknown` 不 Retry、不 Fallback，Delivery 转入同名状态等待人工处理。

### SMTP 与 Worker 恢复

- 只有 SMTP Server 在邮件数据传输完成后返回最终成功响应，SMTP Adapter 才返回 `accepted`；连接、EHLO 或认证成功不构成接受。模块生成并保存 RFC Message-ID，可解析的 SMTP 队列 ID 仅作为可选 `externalMessageId`。
- 邮件数据明确尚未提交时发生错误，可以依照分类重试；数据可能已提交但最终响应丢失时必须返回 `submission_unknown`。SMTP `accepted` 不自动解释为 `delivered`。
- Worker 只有领取租约、尚未进入 Provider 调用区域的任务，在租约超时后才可安全恢复为 `queued`。一旦 Delivery 为 `sending` 且已创建 Attempt，Worker 崩溃或租约过期后若无法证明调用未发生，Attempt 与 Delivery 都转为 `submission_unknown`。
- 人工重投 `submission_unknown` 前必须明确告知管理员可能造成重复发送。

### Fake Provider

- Fake Provider 只能在显式测试或开发模式启用，生产配置出现 Fake 实例时激活失败。
- Fake 行为必须可确定配置和断言，至少覆盖 `accepted`、可重试失败、永久失败、`submission_unknown` 与超时，用于状态机、Retry、Fallback 和恢复测试；不得在 CI 中调用真实 SMTP 服务。
