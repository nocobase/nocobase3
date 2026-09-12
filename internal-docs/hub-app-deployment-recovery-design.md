---
title: Hub App Deploy/Rollback 结果确认与重启恢复
description: 完成 Hub App 部署结果确认、Hub/Host 重启恢复和未知结果处置。
---

# Hub App Deploy/Rollback 结果确认与重启恢复

## 1. 背景

Operation 基础能力完成后，Hub 和 Host 已经能够保存一次 Deploy/Rollback 的
身份、阶段和执行结果，但执行过程中仍可能出现：

- accepted 或完成响应丢失；
- Hub 写库成功后进程退出；
- Host 已切换 Runtime，但 Hub 尚未完成终局收尾；
- Hub 或 Host 重启；
- Host checkpoint 损坏、缺失或身份不匹配；
- 无法确认结果时，用户重复发起 Deploy/Rollback。

当前 Hub 重启时会把 `queued/deploying` Deployment 直接标记为失败，再按成功
Deployment 恢复 Host。这会把“结果未知”误判为“执行失败”，也可能覆盖 Host
已经完成的 Runtime 切换。

本 PR 在 Operation 基础能力之上，补齐结果查询、重启恢复、受控重试和人工
处置。不扩展 Start、Stop、Restart、Remove 的 Operation 化。

## 2. 前置能力和目标

本 PR 依赖：

- Hub `hubAppOperations`；
- `appInstanceId`、`controlRevision`、`attempt`、`fingerprint`；
- Host Operation Store 和 checkpoint；
- IPC `submit/query/ack`；
- Deployment 与 Operation 的关联。

目标是：

1. IPC 超时或响应丢失时，查询原 Operation，不直接判定失败；
2. Hub/Host 重启后，继续确认同一个 Operation；
3. Host 已成功时只补齐 Hub 数据，不重复切换 Runtime；
4. 明确失败时完成失败收尾并释放 App 控制权；
5. 无法证明结果时进入 `needs-attention`，禁止盲目重试；
6. Retry/Close 具备条件校验、权限校验和处置审计；
7. 旧结果不能覆盖新的 Operation 或新的 attempt。

本 PR 不承诺 Runtime 内部 migration、插件初始化或外部写入的 exactly-once。
无法确认这些副作用时，必须保留现场并进入人工处理。

## 3. Operation 状态

Operation 的 `status` 表示业务处置状态，`phase` 表示 Host 执行阶段。

| status | 含义 | 是否允许新的 Deploy/Rollback |
| --- | --- | --- |
| `queued` | 已入库，尚未提交 Host | 否 |
| `running` | Host 已接收或正在执行 | 否 |
| `reconciling` | 正在查询或补齐 Hub 结果 | 否 |
| `needs-attention` | 结果不明或恢复条件不安全 | 否 |
| `succeeded` | 已确认成功并完成 Hub 收尾 | 是 |
| `failed` | 已确认失败并完成失败收尾 | 是 |
| `closed` | 人工结束，原结果仍不能证明 | 需完成关闭前置校验 |

Host 执行阶段为：

```text
accepted -> preparing -> switching -> succeeded / failed / unknown
```

`reconciling` 和 `needs-attention` 不是成功或失败，也不释放
`activeOperationId`。`closed` 只能在确认原执行者已经停止后产生；它不代表
Runtime 已成功、失败或回滚。

Deployment 继续保存发布/回滚历史。`reconciling` 和 `needs-attention` 期间
Deployment 保持未完成状态；人工 `Close` 后将 Deployment 标记为
`cancelled`，并通过 Operation 保存“结果未确认”的处置结论，不能伪造
`succeeded` 或确定的 `failed`。

## 4. 结果确认流程

Coordinator 对所有未终局 Operation 执行以下流程：

1. 读取 Hub Operation 当前记录；
2. 查询 Host Operation 和 checkpoint；
3. 校验 `operationId`、`appId`、`appInstanceId`、`controlRevision`、
   `attempt` 和 `fingerprint`；
4. 根据 Host 的阶段、结果和错误摘要决定继续查询、恢复、收尾或人工处置；
5. 已确认成功或失败时，在 Hub 事务中完成终局收尾；
6. Hub 事务提交后发送幂等 ack。

处理规则：

| Host 事实 | Hub 处理 |
| --- | --- |
| Host 已成功，Hub 未收尾 | 只补齐 Hub 终局事务，不重新切换 Runtime |
| Host 明确失败，且确认未应用或已恢复旧 Runtime | 完成失败收尾，释放 App 控制权 |
| IPC 超时但 Host 连接仍在 | 进入 `reconciling`，继续 query 原 Operation |
| Host 已退出但有成功/失败 checkpoint | 使用 checkpoint 完成确认和收尾 |
| `preparing` 阶段中断，确认没有 App 副作用 | 允许恢复同一 attempt 或进入有限安全重试 |
| `switching` 阶段中断，结果无法证明 | 进入 `needs-attention`，禁止自动重做 |
| checkpoint 缺失、损坏或身份不匹配 | 进入 `needs-attention`，不覆盖、不清空 |
| ack 丢失 | 重复发送 ack，不重复修改 Host 执行结果 |
| 旧 Operation 或旧 attempt 结果迟到 | 拒绝收尾，不影响新的 Operation |

查询失败只会延迟确认或增加恢复错误，不会直接把 Operation 改为 `failed`。

## 5. Hub 重启恢复

Hub 启动时不再把 `queued/deploying` Deployment 批量改成失败，流程如下：

1. 启动数据库和 Host Supervisor；
2. Host ready 后启动 Coordinator，不阻塞 Hub 自身就绪；
3. 查询所有未终局 Operation；
4. 对每个 Operation 查询 Host Store 和 checkpoint；
5. 已成功的 Operation 补齐 Hub 终局事务；
6. 已明确失败的 Operation 完成失败收尾；
7. `preparing` 阶段且满足安全条件的 Operation 继续处理；
8. `switching` 阶段无法确认的 Operation 进入 `needs-attention`；
9. 单个 App 恢复失败不阻塞其他 App。

Host 进程重启后会生成新的 `hostInstanceId`，但继续读取原有 Operation Store。
当前 IPC 不支持重新连接或收养旧 Host；实际断线时，等待旧 Host 退出并启动新
实例，再查询同一 Operation。

恢复期间，存在活动 Operation 的 App 不进入普通 Deployment Set reconcile。其
`appId` 放入 `preserveAppIds`，Host 不删除或覆盖这些 App 的当前状态。其他
没有活动 Operation 的 App 继续使用现有恢复流程。

恢复不创建新的 Deployment，不因为 Host 重启就重复执行一次 Deploy/Rollback。

## 6. Host 重启恢复

Host 启动时：

1. 加载并校验 Operation Store；
2. 校验 checkpoint 的格式版本、Operation 身份、App 实例、控制版本和
   fingerprint；
3. 对已成功或已失败的 checkpoint 提供查询结果；
4. 对 `preparing` checkpoint 判断是否可以安全继续；
5. 对 `switching` checkpoint 不自动重放，返回未知结果；
6. 在收到 Hub ack 前保留终局 checkpoint 和结果摘要。

自动恢复或重试只允许发生在制品读取、校验、解压和配置准备等未进入 App 代码
副作用的阶段。以下阶段不自动重放：

- Runtime 激活或切换；
- migration、插件初始化和 App 启动代码；
- 外部系统写入；
- 无法证明旧 Runtime 已停止的 fallback。

Host Operation Store 必须使用原子写入。读取到损坏或未知版本时 fail closed，
保留原文件并返回可诊断错误，不能清空后继续执行。

## 7. Retry 和 Close

新增接口：

```http
GET  /api/hub/apps/:appId/operations/:operationId
POST /api/hub/apps/:appId/operations/:operationId/retry
POST /api/hub/apps/:appId/operations/:operationId/close
```

### 7.1 Retry

Retry 只允许用于 `needs-attention` Operation，并必须满足：

- 原 Host 执行者已经退出；
- Operation snapshot 和配置引用完整；
- Host 当前状态已经查询；
- 用户确认可能发生的 Runtime 或业务副作用；
- 请求携带期望的 `controlRevision`、当前 `attempt` 和幂等处置 ID；
- 服务端记录操作者、原因、确认结果和时间。

Retry 保留原 `operationId`、目标 snapshot、`controlRevision` 和 fingerprint，
只递增 `attempt`。查询重试、ack 重发和 IPC 重连不递增 attempt。

每个 attempt 的开始、Host 实例、phase、结果和错误都要保留，不能只覆盖
`hubAppOperations.attempt` 当前值。建议新增 `hubAppOperationAttempts` 记录
attempt 历史，`hubAppOperations` 只保存当前 attempt 和聚合状态。

Retry 请求本身必须幂等。响应丢失后重复提交同一个处置 ID，只返回已有处置结果，
不能创建新的 attempt。

### 7.2 Close

Close 不是直接清空 `activeOperationId`。执行前必须：

1. 查询 Host 当前 Operation 和 Runtime 状态；
2. 确认原执行者已经退出；
3. 关闭 App 的新请求准入；
4. 记录 observed result、关闭原因、操作者和时间；
5. 在事务中将 Operation 置为 `closed`，Deployment 置为 `cancelled`，
   清空 `activeOperationId`。

如果无法确认 Runtime 当前状态，Close 不能声称“已停止”或“已回滚”。后续新的
Deploy/Rollback 仍必须先经过 Host 当前状态校验，旧 Operation 的迟到结果不能
更新新的 Operation。

Retry 和 Close 都必须校验 App 归属、权限、`appInstanceId`、
`controlRevision` 和当前 attempt，不能通过手工修改数据库解锁。

## 8. 页面状态

App 详情和 Deployment 页面增加：

- Operation status、phase 和当前 attempt；
- 最近一次查询时间和恢复错误；
- `reconciling`、`needs-attention`、`closed` 的明确展示；
- Retry/Close 入口及权限状态；
- 目标 Release 和结果摘要。

页面需要区分：

- Deployment 已成功；
- Runtime 当前 Running；
- lazy 尚未激活；
- 用户主动 Stop；
- Host 不可用；
- Operation 结果确认中；
- Operation 结果不明。

轮询、刷新或 Host 查询失败不能直接把 Operation 改为 `failed`。

## 9. 改动范围

### 9.1 `@nocobase/app-plugin-hub`

- `server/services/operation-coordinator.ts`
  - 启动扫描、结果查询、恢复调度、Retry、Close 和 ack；
- `server/services/operation-store.ts`
  - 恢复状态迁移、条件终局收尾和处置幂等；
- `server/providers/hub.ts`
  - Host ready 后启动恢复协调；
- `server/services/hub.ts`
  - 移除重启时批量失败逻辑；
  - 接入 `preserveAppIds` 和活动 Operation 门禁；
- `server/routes/index.ts`
  - 增加 Operation 查询、Retry 和 Close API；
- `server/tokens.ts`
  - 增加恢复状态、attempt 历史和人工处置类型；
- `database/migrations/`
  - 增加恢复字段和 `hubAppOperationAttempts`；
- `client/pages/hub/detail.tsx`、`deployments.tsx`
  - 展示恢复状态和人工处置入口。

### 9.2 `@nocobase/app-host`

- `src/management/operation-store.ts`
  - checkpoint 查询、恢复和安全清理；
- `src/management/ipc.ts`
  - query/ack、恢复提交和响应校验；
- `src/management/managed-reconciler.ts`
  - 返回可恢复阶段和明确未知结果；
- `src/management/manager.ts`、`src/supervisor.ts`
  - 配合 Host ready、退出和重启；
- 增加 IPC 中断、Host 重启、checkpoint 损坏和幂等测试。

### 9.3 不修改

- 不将 Start、Stop、Restart、Remove 纳入本 PR；
- 不引入消息队列或远程调度系统；
- 不承诺业务副作用 exactly-once；
- 不改变 standalone Host 的部署目录和生命周期语义；
- 不做多 Host、多 Hub、远程 Host 和 Kubernetes 调度。

## 10. 测试和验收

- accepted 响应丢失后可以查询同一 Operation；
- 完成响应丢失后可以补齐 Hub 终局事务；
- Host 已成功、Hub 收尾失败时不重复切换 Runtime；
- Hub 在 `queued/running/reconciling` 状态重启后可以继续确认；
- Host 在 `accepted/preparing/switching/succeeded` 阶段退出时符合恢复规则；
- `preparing` 阶段只在安全条件满足时自动恢复；
- `switching` 阶段中断进入 `needs-attention`；
- checkpoint 损坏、权限不足和身份不匹配被安全拦截；
- 相同 Operation、attempt 和处置 ID 重复请求不产生副作用；
- Retry 递增 attempt 并保留历史，Close 不伪造成功或失败；
- 旧 Operation、旧 attempt 和迟到 ack 不能覆盖新状态；
- 页面正确区分 Operation、Deployment 和 Runtime 状态；
- standalone Host 现有测试不回归。

## 11. 发布影响

需要：

- `@nocobase/app-plugin-hub` 和 `@nocobase/app-host` changeset；
- 新增恢复字段和 `hubAppOperationAttempts` migration；
- migration、真实子进程、IPC 故障注入和恢复测试；
- 如页面或 Hub 模板的生产代码发生变化，再增加
  `@nocobase/app-template-hub` changeset。
