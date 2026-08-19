# 确定通知存储 Schema、约束与迁移契约

Type: grilling
Status: resolved
Assignee: codex
Blocked by: 05, 06, 07, 09

## Question

在 Delivery 是唯一持久化工作事实、EventQueue 仅负责唤醒的前提下，Notification、Delivery、DeliveryAttempt、DeliveryStatusEvent 与 UserNotificationItem 分别需要哪些字段、外键、唯一约束和查询索引；`queued` 到期扫描、`sending` 租约恢复、Inbox 未读查询与 Delivery Log 如何由数据库抽象表达；首期 migration 与未来数据库组件的责任怎样划分？

## Working decisions

- 用户投影正式命名为 `UserNotificationItem`，一条记录对应一个 `Notification + userId + Channel`，也就是一个 userId Delivery；同一 Notification 的 In-app 与 Email 按两条显示并分别已读、删除和筛选，旧称 `InboxItem` 不再作为独立领域实体。
- Recipient Snapshot 直接保存在 Delivery，不建立 NotificationRecipient 表；Content Snapshot 使用公共元数据列加经过 Channel Schema 校验、带 Schema 版本的 JSON，不保存原始模板变量。
- 领域 ID 使用应用侧生成的 UUIDv7 opaque string；持久化时间为 UTC，领取、租约和到期扫描使用 Database Adapter 提供的数据库时间。
- Notification 与 Delivery 保存当前状态和并发版本，DeliveryStatusEvent 追加保存历史；状态字段使用字符串，由中央领域状态机校验，不使用数据库 Enum。
- Delivery 保存不含凭证的 Provider Chain、配置 revision、游标与当前实例 Attempt 次数；Attempt 保存实际 Provider Instance、Type 与 revision。
- 通知领域只依赖领域化 `NotificationStore`，不依赖 SQL、方言或通用 Query Builder。首期实现完整 Contract Test、基于共享 DatabaseManager 的生产 Adapter，以及显式开发/测试用内存 Adapter；生产缺少持久化实现时激活失败。
- 通知模块拥有版本化逻辑 Schema 和迁移意图；共享 `@nocobase/database` 负责方言映射、执行、事务及迁移版本，生产 Adapter 必须通过通知模块的 Store Contract Test。一期不迁移旧通知数据。
- Notification 保存来源、可信 Principal、触发时间、消息模式、模板身份和当前汇总状态，不保存完整变量、用户资料或最终 Channel 内容。
- DeliveryStatusEvent 追加保存 Delivery 的前后状态、关联 Attempt、原因、操作者、发生时间和脱敏 metadata；Notification 汇总状态不复制另一套事件流。
- Delivery 直接承载 `nextRunAt`、处理租约、Provider 游标、当前实例 Attempt 次数、并发版本和脱敏末次错误，不增加 QueueJob 或 `claimed` 状态。
- 用户删除通知中心条目只改变其个人展示状态，不取消 Delivery，迟到 Retry/Fallback 成功也不得自动恢复已删除条目。
- Delivery、Attempt 及用户通知投影使用业务唯一约束阻止同一 Notification 内重复；不同 Notification 之间不去重。Worker、Inbox 和 Delivery Log 按已确定的领取、租约、用户/Channel/未读及管理筛选路径建立索引。
- Trigger 为每个 userId Delivery 创建一个尚不可见的 UserNotificationItem；In-app 在对应 Delivery `delivered`、Email 在对应 Delivery `accepted` 时使该条目可见，失败条目保持不可见。直接 Email Recipient 不创建用户条目。
- UserNotificationItem 使用自己 Channel 的 Content Snapshot，只有一个 Channel；唯一约束为 `(notificationId, userId, channel)`，已读、删除和迟到成功均按条目独立处理。
- UserNotificationItem 最小字段为 `id/deliveryId/notificationId/userId/channel/availableAt/readAt/deletedAt/createdAt/updatedAt/version`；`deliveryId` 唯一，显示时读取关联 Delivery 的不可变 Content Snapshot，不重复保存 Email HTML。Email 后续进入 `bounced/rejected` 不撤销已经可见的条目。
- “全部已读”只处理当前 Principal 在事务开始前已经可见、未删除且未读的条目，并接受可选 Channel 条件；使用数据库时间写入 readAt，新到达条目保持未读。
- 一个 Delivery 状态转换必须原子完成 Delivery CAS、Attempt、StatusEvent、对应 UserNotificationItem 和 Notification 汇总投影；并发 Channel 由具体 Adapter 串行化或 CAS 重试，不能丢失汇总结果。
- DeliveryStatusEvent 使用 `(deliveryId, sequence)` 唯一序号；时间与 UUID 不承担同一 Delivery 内的业务顺序。
- 领域外键默认引用保护，不允许直接级联删除投递账本；未来 Retention Purger 按 UserNotificationItem、StatusEvent/Attempt、Delivery、Notification 的显式依赖顺序处理。
- Content Snapshot、Provider Chain Snapshot 与 Event metadata 分别携带独立 schemaVersion；读取端对未知版本返回显式兼容错误。
- UserNotificationItem 以 `(deliveryId)` 和 `(notificationId, userId, channel)` 保证唯一，并分别为全 Channel 列表、Channel 列表和未读计数建立以 userId、可见性、删除、创建时间为主的索引；不再建立 Channel 关联表。

## Answer

> 2026-08-19 develop 更新：仓库新增完整 `@nocobase/database` DatabaseManager、跨 SQLite/PostgreSQL/MySQL 的 Builder/Query/Transaction 能力与 checksum/lock migration。NotificationStore Interface 继续保留领域原子语义，但首期必须同时交付基于 DatabaseManager 的生产 Adapter；“生产 Adapter 等待未来数据库组件”的决定被覆盖。内存 Adapter 仅用于快速领域测试。

### 领域记录

- `Notification` 保存 `id`、来源类型与引用、可信 Principal、触发时间、消息模式、模板身份、当前汇总状态及版本和时间字段；不保存完整变量、用户资料、凭证或最终 Channel 内容。
- `Delivery` 是唯一持久化工作事实，保存 Notification 外键、Channel、Recipient Snapshot、Content Snapshot 及其 schemaVersion、Provider Chain Snapshot 及其 schemaVersion、Provider 游标、当前实例 Attempt 次数、状态/状态变更时间、`nextRunAt`、租约 Token/所有者/过期时间、并发版本、末次 Attempt 和脱敏错误。
- `DeliveryAttempt` 保存每次实际 Provider 调用的序号、Provider Instance/Type/config revision、状态、开始时间、`invocationStartedAt`、结束时间、Provider message ID、错误阶段/分类/代码/脱敏信息及版本化 metadata。
- `DeliveryStatusEvent` 追加保存 Delivery 前后状态、每 Delivery 单调序号、关联 Attempt、原因、操作者、发生时间和版本化脱敏 metadata。
- `UserNotificationItem` 一对一引用 userId Delivery，保存 `id/deliveryId/notificationId/userId/channel/availableAt/readAt/deletedAt/createdAt/updatedAt/version`。Trigger 创建它但不立即可见；In-app Delivery 进入 `delivered` 或 Email Delivery 进入 `accepted` 时设置 `availableAt`。直接 Email Recipient 不创建它；Email 后续 bounced/rejected 不撤回已可见条目。

### 约束与状态操作

- `(notificationId, userId, channel)`、`(deliveryId)` 和 `(deliveryId, attemptSequence)` 唯一；不同 Notification 之间不去重。
- Delivery 状态 CAS、Attempt、StatusEvent、UserNotificationItem 可见性和 Notification 汇总投影必须在一个事务中完成。Notification 汇总按当前 Delivery 状态重算，避免并发计数器漂移。
- Worker 领取不增加 `claimed` 状态。Provider 调用前先持久化 `invocationStartedAt`；租约到期且该字段为空时可回到 `queued`，否则转为 `submission_unknown`。所有续租和结果提交必须匹配唯一 `leaseToken` 与 Delivery version。
- 人工重试重置 Provider 游标到原 Chain 首个实例、清零当前实例自动重试次数，保留所有旧 Attempt 和 StatusEvent；`submission_unknown` 必须经过重复发送风险确认。
- UserNotificationItem 的 read/unread/delete 命令幂等；删除不可逆且不取消 Delivery。全部已读接受可选 Channel 条件，只更新操作事务开始前已可见的条目。

### 数据库与迁移

- 通知领域依赖 `NotificationStore` Facade，内部拆为 Command、Query、Maintenance 和 Migration 能力；不依赖 SQL、方言或通用 Query Builder。
- 首期同时提供内存 Adapter、基于共享 DatabaseManager 的生产 Adapter 与完整 Contract Test。生产验收以 PostgreSQL 为基线；通知 Adapter 不复制 SQLite/PostgreSQL/MySQL 方言逻辑，其他数据库由共享 DatabaseManager 的适配组件承接，并继续复用同一 Contract Test。
- 通知模块使用 `defineMigration` 声明版本化 Schema，复用共享 Migrator 的事务、checksum、history 与 lock。外键默认引用保护，不做级联删除；未来 Retention Purger 按显式依赖顺序批量处理。一期不迁移旧通知数据。

## Supersedes

- 本票据覆盖票据 05 和 13 中“同一 Notification + userId 跨 Channel 聚合为一条 InboxItem”的早期表述，最终采用每 Channel 独立 UserNotificationItem。
