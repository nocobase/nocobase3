# 原型验证数据库队列、租约与恢复行为

Type: prototype
Status: resolved
Blocked by: 05, 06

## Question

用最小可运行原型验证立即发送的数据库任务如何原子领取、续租、失败重试和超时回收；怎样区分可安全重新排队的任务与可能已经调用 Provider 的遗留 `sending` Attempt，并把后者恢复为 `submission_unknown` 而不是自动重发；在 SQLite 与 PostgreSQL 语义差异下如何保持相同领域契约；删除优先级、`sendAt`、可配置多层并发与幂等后，哪些最小行为仍必须进入最终规格？

## Answer

> 2026-08-19 develop 更新：仓库新增 `@nocobase/queue`，已经提供统一 QueueManager、Job、Worker、sync/fake/redis/database Driver、配置和共享关闭能力。因此本票据中“自建 EventQueue Interface 与 Memory Adapter”的实现决定被覆盖；Delivery 作为持久化真相、Dispatcher CAS、`invocationStartedAt`、`submission_unknown` 和 Reconciler 语义继续有效。

### 原型与参考结论

本票据先用数据库探针验证了领取、租约、Retry、Fallback 和崩溃恢复状态机，再比较通用持久化队列，并检查 NocoBase 现有 EventQueue。原型证明 `sending` 崩溃必须保守转为 `submission_unknown`；但最终没有采用 PostgreSQL 专用队列，因为后续注入的业务数据库并不保证是 PostgreSQL。

参考资产：

- [运行说明与边界](../prototypes/durable-queue/README.md)
- [SQLite/PostgreSQL 数据库探针](../prototypes/durable-queue/prototype.mjs)
- [可双击的状态机演示](../prototypes/durable-queue/walkthrough.html)
- [通用持久化队列库选型研究](../research/04-queue-library-options.md)

数据库探针在 SQLite 与 PostgreSQL 17.5 上均通过：四个并发 Worker 对三个任务只产生三个唯一领取；Attempt 前崩溃可恢复为 `queued`；`sending` 崩溃恢复为 `submission_unknown`；主 SMTP 三次失败后切换备用 SMTP。该探针保留为状态机证据，不构成生产数据库支持范围或实现蓝本。

### 最终模块划分

- 共享 `@nocobase/queue` 只负责进程内或外部 Driver 的发布、消费、固定并发和关闭，不拥有通知领域状态；通知模块不再建设独立 EventQueue Module。
- Notification Dispatcher 负责 Delivery、Attempt、Retry、Fallback 和 Provider 调用；Delivery 数据库记录是唯一可靠事实，Queue 消息只是可丢失、可重复的工作唤醒信号。
- Notification Reconciler 负责从数据库恢复未被及时分发的工作，以及处理过期的 `sending` Attempt。该职责属于通知领域，不能下放给共享 QueueManager。
- 不采用 pg-boss、Graphile Worker 或数据库方言专用 QueueJob 表；首期不增加独立 QueueJob 领域记录。

### QueueManager 集成

- 通知直接注册共享 `NocoBaseQueueManager` Job，Payload 只保存 `{ deliveryId }`；Job、Adapter 和日志不得复制 Recipient、内容、变量或凭证。
- Queue Driver 由 App Template 配置选择 sync、fake、redis 或 database；生产建议 database 或 redis，开发/测试可使用 sync/fake。通知模块不实现第二套 Queue Adapter 或 Queue 配置系统。
- Queue 内建 retry、delay、priority 与 dedup 不表达通知业务 Retry/Fallback/幂等。Notification Job 每次只尝试原子领取并执行一次 Delivery，业务等待仍以 Delivery.nextRunAt 与 Reconciler 为真相。
- 通知模块拥有自己创建的 Queue Worker 与 Job 注册；共享 QueueManager 及连接由 App Services 统一关闭。

### 持久化、执行与重复保护

- Trigger 事务只提交 Notification、Delivery、快照和初始状态事件。事务成功后立即通过 QueueManager dispatch `{ deliveryId }`；发布失败不回滚已提交的 Notification，而是记录可观测错误并交给 Reconciler 补偿。
- Delivery 承载 `nextRunAt`、`processingLeaseExpiresAt`、Provider 游标和当前实例 Attempt 次数，不增加 `claimed` 状态。Queue 消费者必须通过数据库 Adapter 的原子条件更新执行 `queued → sending` 并在同一事务创建 Attempt；重复消息只有一个消费者能够成功。
- Job 每次都重新读取 Delivery。终态、尚未到 `nextRunAt` 或已由其他 Worker 执行的消息直接确认并忽略，绝不能看到 Queue Job 就盲目调用 Provider。
- Retry 的 30 秒与 2 分钟等待以 `nextRunAt` 为持久化事实；正常进程可用 Timer 到期后发布，Timer 丢失由 Reconciler 恢复。
- `sending` 期间保存处理租约并续租。进程崩溃或租约过期后，如果无法证明 Provider 尚未调用，Attempt 与 Delivery 原子转为 `submission_unknown`，Queue Driver 不得自动再次调用 Provider。

### Reconciler 与数据库独立性

- Portal 激活时立即扫描一次已到期的 `queued` Delivery；运行期间每 30 秒低频扫描并重新发布。重复发布是允许的，正确性依赖数据库原子状态转换而不是 Queue 去重。
- 同一轮 Reconcile 在单进程内不得并发重入；多实例可以重复扫描与发布，仍由数据库原子更新仲裁。未来若注入分布式锁，可以减少重复工作，但不是正确性前提。
- Reconciler 同时扫描过期 `sending` Attempt 并转为 `submission_unknown`。它不把 `sending` 直接恢复为 `queued`。
- 通知领域通过 `NotificationStore` 使用数据库事务、条件更新、数据库时间、到期查询和迁移等领域能力；生产 Adapter 基于共享 `@nocobase/database` DatabaseManager，Queue Driver 不感知通知领域数据模型。
