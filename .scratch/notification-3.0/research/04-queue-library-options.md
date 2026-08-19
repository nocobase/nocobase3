# Node.js 通用持久化队列库选型

> 研究日期：2026-08-18
> 范围：通知投递模块；首期 PostgreSQL，未来持久化能力可能由独立数据库组件注入。
> 资料口径：仅使用项目官方文档、官方仓库和 npm 官方元数据。

## 结论

> **已被 2026-08-19 `develop` 更新 supersede。** 本报告是在仓库共享队列包加入前形成的候选调研；当前实现不采用 pg-boss 或自建 `DeliveryQueue`，直接复用 `@nocobase/queue` 的 `NocoBaseQueueManager` 与其配置的 sync/fake/redis/database Driver。报告中的 pg-boss 比较仍保留作为历史研究记录。

**首期推荐：采用 pg-boss，但只通过项目自有的薄 `DeliveryQueue` 端口接入；不要让领域层直接依赖 pg-boss，也不建议现在自研 Worker/重试/并发/停机这一整套队列运行时。**

原因是：在本次候选中，pg-boss 是唯一同时满足以下关键条件、且 PostgreSQL 路径已经相对成熟的方案：

- 库负责领取、锁超时、崩溃后重领、retry/backoff、多实例协调和 graceful shutdown；
- 可以把 job 与 `Notification` / `Delivery` 的业务写入放进**调用方已经开启的同一个 PostgreSQL 事务**；
- 普通队列是默认策略，singleton/dedupe 是显式选择，不会强迫领域模型采用队列库的唯一性语义；
- payload 可以只放 `{ deliveryId }`，继续让 `Notification`、`Delivery`、`Attempt` 成为业务真相。

pg-boss 不是跨 Redis、MongoDB、SQS 的通用存储抽象，它是 PostgreSQL/兼容实现。因此，“未来数据库可替换”应由本项目自己的 `DeliveryQueue` 端口保证，而不是泄漏 pg-boss API 后再指望替换。未来真有第二种持久化后端时，再增加 BullMQ、Agenda 或另一种 adapter。

这项建议会改变此前“`Delivery` 本身就是唯一队列记录、不允许单独 QueueJob”这一假设：pg-boss 会维护独立的运输 job/schema。若该假设不可改变，则没有一个已调查的成熟库能直接复用现有 `Delivery` 表并同时接管 Worker、retry/backoff、并发、crash recovery 与 shutdown；届时只能自研极薄 PostgreSQL adapter，但所谓“极薄”只限 SQL，队列运行时的复杂性仍然由项目承担。这与本轮希望“交给通用队列库”的目标相反。

BullMQ 6 和 Agenda 6 是值得关注的真正多后端抽象，但截至研究日，它们的 PostgreSQL 后端都很新，而且内置 PostgreSQL 实现都不能加入调用方现有业务事务。暂不建议首期押注。

## 先区分两个容易混淆的目标

“数据库只是做持久化”可能有两种含义：

1. 队列引擎管理自己的 transport 表，数据库只是它的 durable backend；领域表仍由业务管理。
2. 队列引擎必须直接把现有 `Delivery` 表当作 queue storage，不得再有 job 表。

成熟队列库基本都选择第 1 种。它们要持久化锁、可见时间、调度时间、失败计数、内部状态和版本信息，因而需要自有 schema。第 2 种只能由项目自定义 storage/runtime 实现。

另外，本文的“事务内 enqueue”指 job 能加入**调用方已经开启、正在写业务记录的同一个数据库事务**；库内部用事务保证一次队列状态转换原子，并不等价。如果两者不能同事务，通知创建与 enqueue 之间仍需要 outbox、after-commit 补偿或定期 reconciler。

## 总览

| 候选 | 持久化后端可替换 | 调用方事务内 enqueue | 领取与 crash recovery | retry / 多实例 / 停机 | 唯一性可关闭 | 运行时与维护 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **pg-boss 12.26.x** | 否；PostgreSQL/兼容后端，但可注入 SQL executor | **是**；官方 ORM transaction adapters | `SKIP LOCKED`；到期重领；可选 heartbeat | 有；multi-master；graceful stop | 是；standard 默认，singleton/dedupe opt-in | Node >=22.12；ESM；MIT；活跃 | **首选，薄封装** |
| Graphile Worker 0.17.3 | 否；PostgreSQL-only | **是**；SQL `add_job()` 可加入当前事务 | 行锁；OSS 意外退出后的 job 至少锁 4 小时，快速 heartbeat recovery 属 Pro | 有；多 worker；信号停机等待 | 是；`jobKey` 不传即可 | Node 22；ESM；MIT；活跃但仍 0.x | 能用，但恢复时延不适合首选 |
| BullMQ 6.1.2 | **是**；`IQueueBackend`，官方 Redis/PostgreSQL | **否**；内置 PG API 不接调用方 `PoolClient` | lock renewal、stalled reclaim、at-least-once | 功能完整；多 worker；`Worker.close()` | 是；dedupe/jobId 均显式启用 | CJS+ESM；Node 22 可用；MIT；活跃 | 架构理想，但 PG 后端仅约 3 周，观察 |
| Agenda 6.2.6 | **是**；官方 Mongo/Postgres/Redis/custom backend | **否**；内置 PG repository 自己从 pool 查询 | `SKIP LOCKED`；过期锁重领；可 touch | 有；多实例；`drain()` 等待 | 是；unique/debounce opt-in | ESM-only；Node >=18；MIT；活跃 | 可观察；v6 backend/PG 路径约 7 个月 |
| Bree 9.2.9 | 无 storage adapter | 否 | 无 durable claim/lease/reclaim | 主要是进程内 worker/thread/timer | 不适用 | Node 22 可用；MIT；活跃 | **不是持久化分布式队列** |
| better-queue 3.8.12 | 有 pluggable store | 否 | `takeFirstN`/`takeLastN` 取出即移除，没有可靠 lease/ack/reclaim | 有部分处理能力，但不能证明崩溃安全 | 非本题关键 | CJS/callback；约 4 年未发布；MIT | **不采用** |

版本是研究日快照。pg-boss npm 当日与仓库快照可能相差一个补丁版本，故以 12.26.x 表示。

## 1. pg-boss：当前最贴合首期约束

pg-boss 明确以 PostgreSQL `SKIP LOCKED` 实现领取，支持在现有数据库事务中创建 job、指数退避和 multi-master；它还结合 polling backstop 与 `LISTEN/NOTIFY` 降低空闲等待延迟。官方也把数据库兼容范围和运行要求列为 PostgreSQL 13+、Node 22.12+。[官方 README](https://github.com/timgit/pg-boss)；[数据库后端说明](https://github.com/timgit/pg-boss/blob/master/docs/database-backends.md)

### 后端与事务

- 后端不能替换为 Redis/MongoDB/SQS；扩展点是 `IDatabase.executeSql`，仍要求 PostgreSQL 语义。
- 官方给出 Drizzle、Knex、Kysely、Prisma 等 transaction adapter，可将 `send(..., { db: adapter(tx) })` 加入现有业务事务。这是它相对 BullMQ/Agenda 内置 PG backend 的决定性优势。[ORM transaction adapters](https://github.com/timgit/pg-boss#orm-transaction-adapters)
- enqueue 与领域记录同 commit 后，不再需要“业务已提交但 job 丢失”的正常路径补偿；仍应保留运维 reconciler，以处理人为删 job、迁移事故等异常。

### 领取、恢复与重试

- `FOR UPDATE SKIP LOCKED` 允许多实例竞争而不重复持有同一条可领取 job。
- `expireInSeconds` 限制 job active 时长，超时后可以重领；可配置 `heartbeatSeconds` 延续活跃任务并识别崩溃、OOM 或网络分区。heartbeat 默认关闭，通知投递应显式开启并设置短于 expire 的合理间隔。[Queue policies](https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md)
- 支持 `retryLimit`、固定 `retryDelay`、指数+jitter `retryBackoff`、`retryDelayMax` 和 dead-letter queue。[Jobs API](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md)
- standard queue 是默认策略；singleton、throttle、debounce 等限制是显式启用。因此可让业务层自己决定幂等，而不被库强制合并 job。[Queue policies](https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md)

### 并发、实例与停机

- 官方声明支持 multi-master；多个应用实例可以安全运行 Worker。[官方 README](https://github.com/timgit/pg-boss)
- Worker API 支持批量领取。单进程的精确并发上限仍宜由薄 adapter 统一控制，例如注册有限数量的 worker 或对批次使用 bounded concurrency；这属于少量接入策略，不需要重写领取算法。
- `stop()` 默认等待正在处理的 job，并有 graceful 超时配置。[Operations API](https://github.com/timgit/pg-boss/blob/master/docs/api/ops.md)

### 兼容性与维护

当前包为 ESM，`engines.node` 要求 Node >=22.12，许可证 MIT，release 持续更新。[package.json](https://github.com/timgit/pg-boss/blob/master/package.json)；[官方 releases](https://github.com/timgit/pg-boss/releases)；[npm](https://www.npmjs.com/package/pg-boss)

项目根当前允许 Node >=20；若采用当前 pg-boss，必须把服务端实际运行基线提升到 >=22.12，或单独做兼容版本评估，不能只依赖“开发机是 Node 22”。

## 2. Graphile Worker：事务很好，OSS crash recovery 太慢

Graphile Worker 同样是 PostgreSQL-only。最可靠的事务接入方式是在当前业务 transaction 中直接调用 `graphile_worker.add_job()` SQL 函数；JavaScript 的 `WorkerUtils.addJob()` 本质上也调用这一函数，但通常只接 pool。[SQL add_job](https://worker.graphile.org/docs/sql-add-job)；[Library addJob](https://worker.graphile.org/docs/library/add-job)

它使用锁和 `SKIP LOCKED` 支持多 worker，`LISTEN/NOTIFY` 用于唤醒，同时保留约两秒的定时检查；失败默认最多尝试 25 次，采用指数延迟。`jobKey` 默认不传，因此唯一/替换语义不是强制的。[官方文档](https://worker.graphile.org/docs)；[Job key](https://worker.graphile.org/docs/job-key)

主要问题是 OSS 版的异常退出恢复：官方文档明确说明，进程非正常退出或被 `SIGKILL` 后，active job 会至少保持锁定 4 小时，清理程序每 8–10 分钟处理超过该期限的锁；基于 heartbeat 的更快 recovery 是 Worker Pro 能力。[Error handling](https://worker.graphile.org/docs/error-handling)；[Pro crash recovery](https://worker.graphile.org/docs/pro/recovery)

正常收到 SIGTERM/SIGINT 时，runner 会停止取新任务并等待运行中的 job；第二个信号会强制退出。当前核心包是 ESM、Node 22、MIT，维护活跃；但版本仍是 0.x，官方 release notes 还提示某些数据库 schema 升级需要 scale-to-zero。[package.json](https://github.com/graphile/worker/blob/main/package.json)；[Release notes](https://github.com/graphile/worker/blob/main/RELEASE_NOTES.md)；[npm](https://www.npmjs.com/package/graphile-worker)

若团队愿意购买 Pro 或能接受四小时恢复窗口，它是第二个 PostgreSQL-native 选择；否则不适合作为通知首选。

## 3. BullMQ 6：真正的 backend abstraction，但 PostgreSQL 路径刚发布

BullMQ 6 引入 datastore-agnostic `IQueueBackend`，官方实现 Redis 与 PostgreSQL，同一套 `Queue`、`Worker`、`QueueEvents`、`FlowProducer` API 可以运行在 PostgreSQL。PG 13+ 后端使用独立 `bullmq` schema，SQL 状态转换在事务中完成，并以 `LISTEN/NOTIFY` 唤醒；官方称 workers、flows、scheduler、retry、rate limit、dedup、metrics、events 功能对齐。[PostgreSQL guide](https://github.com/taskforcesh/bullmq/blob/master/docs/gitbook/guide/postgresql.md)；[`IQueueBackend`](https://github.com/taskforcesh/bullmq/blob/master/src/interfaces/queue-backend.ts)

但这里有两个关键限制：

1. 官方 PostgreSQL guide 仍明确称 Redis 是默认且“most battle-tested”的后端。BullMQ 6.0.0 于 2026-07-30 发布，研究日最新 6.1.2 于 2026-08-16 发布；也就是说 PostgreSQL backend/abstraction 正式可用仅约三周，不能等同于 BullMQ 多年的 Redis 成熟度。[v6.1.2 release](https://github.com/taskforcesh/bullmq/releases/tag/v6.1.2)
2. 内置 PG backend 接受 connection string、配置或 `pg.Pool`；`IQueueBackend.addJob` 不接受调用方的 `pg.PoolClient`/transaction。它能保证自身 add/bulk/flow 原子，却没有受支持 API 把 enqueue 加进领域层已经开启的事务。因此首期仍需 outbox/reconciler，或自研 backend。

运行时能力本身很完整：Worker lock 会续期；锁丢失的 stalled job 会重新进入等待队列，形成 at-least-once；retry 支持 fixed/exponential/custom backoff；多 worker 和本地 concurrency 都有明确 API；`Worker.close()` 停止取新 job 并等待当前 job，但强制退出仍可能产生 stalled job。[Stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs)；[Retrying jobs](https://docs.bullmq.io/guide/retrying-failing-jobs)；[Concurrency](https://docs.bullmq.io/guide/workers/concurrency)；[Graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown)

deduplication 只有显式传入配置才启用；自定义 `jobId` 去重同样是显式选择。[Deduplication](https://docs.bullmq.io/guide/jobs/deduplication)；[Job IDs](https://docs.bullmq.io/guide/jobs/job-ids)

包同时发布 CJS/ESM，Node 22 可运行，MIT，维护活跃。[package.json](https://github.com/taskforcesh/bullmq/blob/master/package.json)；[LICENSE](https://github.com/taskforcesh/bullmq/blob/master/LICENSE)；[npm](https://www.npmjs.com/package/bullmq)

**判断：**它最接近“真正通用队列库”，但当前应列入 6–12 个月后的复评名单，而不是把通知首期建立在刚发布的 PG backend 上。

## 4. Agenda 6：可插拔最清楚，但新架构仍在验证期

Agenda 6 把 storage 与 notification 抽为 backend，官方已有 MongoDB、PostgreSQL、Redis 实现，也允许自定义 `AgendaBackend`；存储与唤醒通知渠道还能混搭。PostgreSQL 用 `LISTEN/NOTIFY`，Redis 用 Pub/Sub。[Agenda v6 文档](https://agenda.github.io/agenda/)；[官方仓库](https://github.com/agenda/agenda)；[v6 migration guide](https://github.com/agenda/agenda/blob/main/docs/migration-guide-v6.md)

PostgreSQL repository 使用 `SELECT ... FOR UPDATE SKIP LOCKED` 和 `UPDATE ... RETURNING` 领取任务；超过 lock deadline 的任务可重新领取，长任务可以 touch；默认 lock lifetime 为 10 分钟。Agenda 支持多实例、自动 retry（constant/linear/exponential/jitter/custom），unique 与 debounce 都是 opt-in。停机时 `drain()` 可等待正在执行的任务并设置 timeout/AbortSignal，`stop()` 更偏向立即停止和解锁。[Agenda 官方文档](https://agenda.github.io/agenda/)

不过内置 PostgreSQL repository 直接使用自身 pool 查询，`saveJob` 不接受调用方 transaction client，因而不能把 enqueue 纳入现有领域事务。[PostgresJobRepository](https://github.com/agenda/agenda/blob/main/packages/postgres-backend/src/PostgresJobRepository.ts)

Agenda 项目历史较长，但 v6 backend 重写与 PostgreSQL/Redis backend 都是在 2026-01-27 首发；约七个月仍明显短于其 MongoDB 路径，官方也将 MongoDB 称为最经验证的后端。当前 Agenda 6.2.6 为 ESM-only、Node >=18、MIT，维护活跃。[agenda npm](https://www.npmjs.com/package/agenda)；[PostgreSQL backend npm](https://www.npmjs.com/package/@agendajs/postgres-backend)；[Agenda package.json](https://github.com/agenda/agenda/blob/main/packages/agenda/package.json)

**判断：**如果未来确实要用同一 API 切 Mongo/Postgres/Redis，Agenda 值得复评；首期不值得用 outbox 复杂度换一个尚新的 backend 抽象。

## 5. Bree：scheduler，不是本题需要的 durable queue

Bree 的核心是 worker_threads 与 cron/date/timer 调度。官方特意说明它不强制 Redis/MongoDB 管理 job state，并建议 job 自己查询持久数据库来防止重复。换言之，它没有 storage adapter、durable claim/lease、跨实例 ack/reclaim，也不能提供业务事务内 enqueue。[官方 README](https://github.com/breejs/bree)

它可以配合 `@ladjs/graceful` 管理进程退出，且项目仍活跃、MIT、Node 22 可运行；但这只是调度/线程生命周期能力。选 Bree 后，通知模块仍需自己实现本题最难的数据库队列部分，因此不采用。[package.json](https://github.com/breejs/bree/blob/master/package.json)；[v9.2.9 release](https://github.com/breejs/bree/releases/tag/v9.2.9)；[npm](https://www.npmjs.com/package/bree)

## 6. better-queue：有 store 插件，但不具备现代 durable lease 语义

better-queue 的确有可插拔 store，并提供 memory/SQLite/PostgreSQL/custom 方案。然而其 store contract 以 `takeFirstN` / `takeLastN` 取出并移除任务，没有 durable lease、ack、extend、超时重领这一完整协议。Worker 取出后崩溃时，storage adapter 无法提供可靠 recovery，也不足以证明多实例安全。[官方仓库](https://github.com/diamondio/better-queue)；[npm](https://www.npmjs.com/package/better-queue)

当前 3.8.12 已约四年未发布，仍是 CJS/callback 风格。虽然“storage 可插拔”字面吻合，但可靠性语义不合格，不采用。

## 推荐接入边界

项目应只暴露最小的 transport port，例如概念上包含：

```ts
interface DeliveryQueue {
  enqueue(deliveryId: string, options: EnqueueOptions, tx: DbTransaction): Promise<void>;
  start(handler: (deliveryId: string) => Promise<void>, options: WorkerOptions): Promise<void>;
  stop(): Promise<void>;
}
```

首期由 `PgBossDeliveryQueue` 实现。它的职责限于：

- 同一事务 enqueue `{ deliveryId }`；
- 配置队列名、并发、expire/heartbeat、transport retry/backoff 和停机；
- 把 handler 的有限结果映射成 complete/retry/dead-letter；
- 提供 queue depth、retry、stalled/expired、handler duration 等运输指标。

它不拥有以下业务语义：

- `Notification`、`Delivery`、`Attempt` 的状态定义与迁移；
- provider 的 `accepted`、`rejected`、`submission_unknown`；
- 外部发送幂等键和是否允许再次调用 provider；
- 用户取消、人工重放、审核、保留策略。

推荐的数据流是：

```text
业务事务
  ├─ 写 Notification / Delivery
  └─ 写 pg-boss job { deliveryId }
          ↓ 同一 commit
Worker 领取 job
  ├─ 重新读取并锁定 Delivery
  ├─ 根据领域状态判断是否允许发送
  ├─ 创建/更新 Attempt，调用 provider
  └─ 提交领域结果，再 complete 或安排 transport retry
```

### 必须保持的可靠性边界

- 所有候选本质上都是 at-least-once。job 被领取后，provider 已接受但进程未完成 ack，仍可能再次执行；队列库不能替代业务幂等。
- queue job ID/dedup 只是在 transport 层减少重复排队，不是外部通知幂等。默认不要开启 singleton/dedupe；如要启用，也不能删除业务唯一约束。
- Worker 每次执行必须先读取 `Delivery`/`Attempt` 决定下一步。不能看到 job 就盲发。
- `submission_unknown` 不应被队列库的通用 retry 自动再次发送；应结束当前 transport job，把后续判断交给领域状态机、provider 查询或人工处置。
- queue 的 `waiting` / `active` / `completed` / `failed` 不能直接作为 `Delivery` 状态；两套状态机只能通过明确 handler outcome 映射。

## 采用决定与复评门槛

### 现在

采用“**薄封装 pg-boss**”：接受独立 transport schema；领域表继续 authoritative；同事务 enqueue；显式 heartbeat；bounded concurrency；优雅停机；所有业务幂等留在 `Delivery`/`Attempt`。

### 不建议现在做

- 不直接在领域/应用服务中调用 pg-boss API；否则未来无法低成本替换。
- 不为了“数据库可注入”提前自研完整 backend SPI。只有第二种数据库真的出现时，才能知道 portable contract 应包含哪些能力。
- 不自研 PostgreSQL polling/lease runtime，除非产品明确坚持“Delivery 是唯一队列记录”。
- 不每秒轮询数据库。pg-boss 已组合通知唤醒与 polling backstop；精确间隔应是 adapter 配置，而不是业务逻辑。

### 未来复评

满足以下条件时重新比较 BullMQ 与 Agenda：

- PostgreSQL backend 经历至少若干稳定发布周期和生产反馈；
- 官方支持调用方 transaction client，或项目已经统一采用可靠 outbox；
- 实际出现 Redis/MongoDB/另一种 durable backend，而不是只有抽象上的可能；
- 新 adapter 能通过同一套 contract tests：并发领取、kill -9、锁过期、重复执行、事务回滚、停机超时、跨实例竞争和 schema migration。

如果最终坚持复用 `Delivery` 表、不允许独立 transport job，则选择“自研极薄 PostgreSQL adapter”时必须正视它实际包含：`SKIP LOCKED` claim、lease renewal、过期重领、通知唤醒+polling backstop、backoff、并发控制、SIGTERM drain、multi-instance、迁移与观测。它不是一个简单的每秒查询循环；此路径只因领域存储约束而选，不应被描述为比薄封装成熟队列库更省工程量。
