---
title: Hub App Deploy/Rollback Operation 基础能力
description: 建立 Hub App Deploy/Rollback Operation 的持久化记录、执行协议和幂等控制。
---

# Hub App Deploy/Rollback Operation 基础能力

## 1. 背景

Hub 当前已经支持 App 的 Deploy 和 Rollback，流程如下：

```text
Hub 创建 Deployment
  -> 通过 IPC 通知 Host
  -> Host 切换 App Runtime
  -> Host 返回结果
  -> Hub 更新 Deployment 和当前成功版本
```

当前 `hubAppDeployments` 主要记录发布历史，没有单独记录一次
Deploy/Rollback 的执行身份和过程。执行中的状态主要保存在 Hub 和 Host 的
内存中，依赖进程内锁、Promise 和当前 IPC 请求。

当请求重试、IPC 响应丢失或进程退出时，系统无法准确判断 Host 是否已经收到
请求、执行的是哪个目标，以及旧结果是否会覆盖新的 Deploy/Rollback。

Operation 可以理解为一次 Deploy/Rollback 的“执行单”，负责记录 App 实例、
目标 Release、配置摘要、控制版本、执行阶段和最终结果。Deployment 继续负责
保存发布或回滚历史。

第一版中，Operation 暂时复用 Deployment ID 作为 `operationId`，两个概念仍然
保持独立，为后续 Retry 和多个 attempt 留出扩展空间。

## 2. 当前现状

### 2.1 Hub

- Deploy/Rollback 先创建 `hubAppDeployments`，再异步调用 Host；
- `schedule()` 和 `runDeployment()` 依赖当前进程内的锁和 Promise；
- Host 返回结果后，Hub 更新 Deployment 和 `hubApps.currentDeploymentId`；
- Hub 重启后，内存中的执行状态丢失，当前没有独立的 Operation 记录。

### 2.2 Host

- `ManagedReconciler` 使用内存 `statuses` 保存当前部署状态；
- `operationPromise` 只能保证当前进程内串行执行；
- `HostDeploymentSpec.id` 是稳定的 App ID，不能改成 Operation ID；
- IPC 虽然可以先返回 `accepted`，但 Host 没有可供后续查询的执行记录。

### 2.3 现有协议还缺少什么

`HostDeploymentSet.revision` 表示整组 App 期望部署集合的版本，不能承担单个
Deploy/Rollback 的控制顺序。一次操作还缺少：

- App 实例身份；
- Hub 控制版本；
- 执行 attempt；
- 请求 fingerprint；
- Host 接收记录、执行阶段和结果。

## 3. 要解决的问题

本 PR 建立一套可持久化、可校验、可幂等收尾的 Deploy/Rollback 执行链路：

1. Hub、Host 和 IPC 使用同一个 `operationId` 关联一次执行；
2. 使用 `appInstanceId`、`controlRevision` 和 `fingerprint` 校验请求身份和顺序；
3. Hub 保存 Operation，Host 保存接收记录和 checkpoint；
4. 重复提交、重复完成通知和延迟旧结果不会重复执行或更新当前成功版本。

本 PR 不判断进程中断后的结果是成功还是失败，只提供后续查询和确认所需的基础。

## 4. 目标和边界

### 4.1 本 PR 包含

- 新增 `hubAppOperations`；
- `hubApps` 增加 `appInstanceId`、`controlRevision`、
  `activeOperationId` 和 `lastOperationId`；
- Deploy/Rollback 的事务接纳和 HTTP `Idempotency-Key`；
- 请求 snapshot、fingerprint、Host Operation Store 和 checkpoint；
- IPC `submit/query/ack`；
- 重复提交、旧版本和错误 fingerprint 拒绝；
- 正常执行过程的状态同步和幂等终局收尾；
- 调整启动恢复入口，避免活动 Operation 被旧恢复逻辑覆盖；
- 202 响应返回 `operationId`，同时保留现有 `id`。

### 4.2 本 PR 不包含

- Hub/Host 重启后的自动恢复扫描和结果确认；
- `unknown`、`needs-attention`、`reconciling` 等恢复状态；
- Retry、Close 和人工处置记录；
- Start、Stop、Restart、Remove 的 Operation 化；
- 通用消息队列、远程调度和新的独立 npm 包；
- Runtime、ArtifactResolver、DeploymentCatalog 或 App Registry 重构。

Hub 或 Host 在执行过程中退出时，Operation 保持未终局状态，不直接标记为成功
或失败，由后续恢复 PR 处理。

## 5. 技术方案

### 5.1 Operation、Deployment 和 App 身份

| 对象/字段 | 作用 |
| --- | --- |
| Deployment | 保存一次发布或回滚的业务历史 |
| Operation | 保存一次执行的接纳、阶段和最终收尾 |
| `appId` | Host Runtime 使用的稳定 App 身份 |
| `appInstanceId` | 区分 App 删除后重新创建的新实例 |
| `controlRevision` | Hub 对同一个 App 的 Deploy/Rollback 控制顺序 |
| `attempt` | 一次 Operation 的执行次数，PR 2 固定为 `1` |

第一版采用：

```text
operationId === deploymentId
```

这只是阶段性关联方式，不代表两个概念合并。`HostDeploymentSpec.id` 继续使用
`appId`。`controlRevision` 与 `HostDeploymentSet.revision` 分开维护：

- `HostDeploymentSet.revision`：整组 App 期望部署集合的版本；
- `controlRevision`：单个 App 的 Deploy/Rollback 控制顺序。

### 5.2 Operation 接纳和 HTTP 幂等

HTTP Route 从 `Idempotency-Key` 请求头读取幂等键，通过
`HubOperationRequestOptions` 传给 Service，不放入业务 input。

未携带或空白的 header 按数据库 `NULL` 保存，不保存为字符串 `"null"`。只有
非空 key 参与幂等匹配，并在同一个 `appInstanceId` 内唯一：

- 相同 key、相同 fingerprint：返回已有 Operation；
- 相同 key、不同 fingerprint：返回 409；
- 没有 key：允许创建新 Operation，不保证网络重试自动去重；
- App 删除后重建：旧 key 不再作用于新实例。

接纳流程：

1. 校验 App、Release、Rollback target、配置和权限；
2. 读取并校验幂等键，计算最终配置内容 hash；
3. 进入 `withLock(appId)`，重新读取 App 和业务目标；
4. 在锁内开启事务，生成最终 snapshot 和 fingerprint；
5. 有非空 key 时按 `appInstanceId + key` 查找已有 Operation，命中则返回或
   返回 409；
6. 确认没有活动 Operation 后生成 `operationId` 和独立配置文件；
7. 在同一事务中写入 Operation、Deployment，并使用
   `appInstanceId + activeOperationId IS NULL + controlRevision` 条件更新
   `hubApps`；
8. 条件更新影响行数不是 1 时回滚事务并返回冲突；
9. 事务提交后由 Coordinator 异步提交 Host。

配置文件在确认不是重复请求后再生成。配置文件准备失败、事务冲突或事务提交
失败时，清理本次生成且未被其他已提交 Operation 使用的文件。数据库事务、唯一
约束和条件更新是并发正确性的依据，进程内锁只用于减少竞争。

### 5.3 与其他生命周期操作的关系

Start、Stop、Restart、Remove 不在本 PR 中 Operation 化，但在产生副作用前都要
检查 `activeOperationId`。有活动 Operation 时返回 409，不修改 `enabled`、不
调用 Host，Remove 不删除 App。

`updateConfig` 和 `updateSettings` 也要在写入前检查活动 Operation，避免修改正在
执行的 Operation 使用的配置或启动策略。

没有活动 Operation 时，Remove 在一个事务中删除 App、Release 和 Deployment；
已终局 Operation 保留审计摘要，并将 `deploymentId` 置为 `NULL`。App 重新创建
后，旧 Operation、旧 key 和旧 ack 不得作用于新实例。

### 5.4 请求 snapshot 和 fingerprint

Operation 保存请求摘要，不保存配置正文。snapshot 至少包含：

```text
kind
appId
appInstanceId
releaseId
rollbackTargetDeploymentId
desiredState
activation
basePath
artifact.key
artifact.version
artifact.checksum
config.mode
config.ref
config.contentHash
```

`fingerprint` 是规范化 snapshot 的 SHA-256，Hub 和 Host 使用相同的字段和空值
规则计算。它不包含 `requestId`、`operationId`、`attempt`、Host 实例 ID、绝对
路径和临时文件名。

file 模式下，`contentHash` 取最终写入配置文件的 UTF-8 内容；external 模式由
外部系统管理配置。如果没有稳定的 `config.ref`，`contentHash` 为 `NULL`，不能
通过 fingerprint 判断外部配置内容是否变化。

### 5.5 Operation 状态

Hub 使用 `status` 表示业务生命周期，使用 `phase` 表示执行阶段。

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `status` | `queued` | Hub 已入库，等待提交 Host |
| `status` | `running` | Host 已接收或正在执行 |
| `status` | `succeeded` | Host 成功且 Hub 已完成收尾 |
| `status` | `failed` | 已确认失败且 Hub 已完成收尾 |
| `phase` | `queued` / `accepted` | Hub 创建 / Host 持久化接收 |
| `phase` | `preparing` | Artifact、配置和 Runtime 定义准备 |
| `phase` | `switching` | Runtime 替换、激活或 Artifact commit |
| `phase` | `succeeded` / `failed` | Host 已完成执行 |

Host 的正常阶段为：

```text
accepted -> preparing -> switching -> succeeded / failed
```

IPC 超时或进程退出不能直接写成 `failed`，应保留未终局状态和通信错误。

### 5.6 Host Operation Store 和 IPC

Hub 通过现有 IPC 增加：

```text
submitOperation(request)
queryOperation(query)
acknowledgeOperation(acknowledgement)
```

请求统一校验以下字段：

| 字段 | 作用 |
| --- | --- |
| `operationId` | 一次 Deploy/Rollback 的唯一身份 |
| `appId` | 稳定的 Host App 身份 |
| `appInstanceId` | App 实例身份 |
| `controlRevision` | Hub 控制顺序，跨 JSON 传字符串 |
| `attempt` | PR 2 固定为 `1` |
| `fingerprint` | 请求内容指纹 |
| `kind`、`releaseId`、`rollbackTargetDeploymentId` | Hub 业务目标 |
| `snapshot` | Host 实际执行所需的 Deployment Spec |

Host 必须先完成协议、身份、snapshot 和 fingerprint 校验，再写入 Operation Store，
最后返回 `accepted`。accepted 只表示“已接收并持久化”，不表示 Runtime 已切换
成功。

Host 的处理规则：

| 场景 | 处理 |
| --- | --- |
| 相同 Operation、attempt 和 fingerprint 重复提交 | 返回已有状态，不重复执行 |
| 相同 Operation 但身份或 fingerprint 不同 | 拒绝请求 |
| 旧 `controlRevision` | 返回 `STALE_CONTROL_REVISION` |
| 相同控制版本但业务内容不同 | 拒绝请求 |
| 旧 `appInstanceId` | 返回 `STALE_APP_INSTANCE` |
| 非 `1` 的 attempt | 返回 `ATTEMPT_NOT_SUPPORTED` |

Host Store 按 `appId` 保存当前实例基线，至少记录
`latestAppInstanceId`、`latestControlRevision`、`latestOperationId` 和
`latestFingerprint`。Operation 记录、当前实例基线和控制版本必须原子更新，避免
旧 Operation 覆盖新 Operation。

Host 随后返回最终结果，或由 Hub 调用 `queryOperation()` 查询已持久化结果。
查询和 ack 必须校验完整身份，不能只依赖 `operationId`。ack 只表示 Hub 已完成
终局收尾，不改变 Host 自己记录的执行结果；重复 ack 必须幂等。

`hostInstanceId` 由 Supervisor 每次启动 managed Host 子进程时生成，通过
`APP_HOST_INSTANCE_ID` 传给 Host；它和鉴别当前 IPC 连接的 `session` 不同。

### 5.7 正常执行和终局收尾

Coordinator 流程：

1. 提交 `submitOperation`；
2. 收到 accepted 后，将 Hub Operation 更新为 `running` 并记录 Host 实例；
3. Host 执行阶段持续写入 checkpoint；
4. 收到最终结果后，在一个数据库事务中完成 Operation、Deployment 和 App 状态
   收尾；
5. 事务提交成功后发送 ack。

成功时同时更新 Operation、Deployment、`currentDeploymentId` 和
`activeOperationId`，并保存 Host revision、cacheHit 和完成时间。失败时更新
Operation 和 Deployment 为失败，保留上一条成功 Deployment，并清空
`activeOperationId`。

终局更新必须带 `operationId`、`appInstanceId` 和 `controlRevision` 条件。更新
影响行数为 0 时重新读取 Operation 和 App：同一 Operation 已终局则返回已有结果；
App 已指向新的 Operation 则丢弃旧结果；身份或控制版本不匹配则记录冲突并拒绝
收尾。

### 5.8 启动恢复兼容

本 PR 不实现重启恢复，但要调整现有 `restoreDesiredState()`：

- 活动 Operation 的 App 不按旧成功 Deployment 重新 reconcile；
- 不因活动 Operation App 未进入恢复集合而将其从 Host 状态中删除；
- 恢复请求增加 `preserveAppIds` 或等价字段，要求 Host 保留这些 App 的现有状态；
- 没有活动 Operation 的 App 继续使用现有恢复流程；
- 活动 Operation 的查询、重发和结果确认由后续恢复 PR 处理。

## 6. 数据模型

### 6.1 `hubApps`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `appInstanceId` | string | 创建时生成，删除重建后变化 |
| `controlRevision` | bigint | Hub 控制版本，初始为 `0` |
| `activeOperationId` | string/null | 当前未终局 Operation |
| `lastOperationId` | string/null | 最近一次已接纳 Operation |

迁移已有数据时，为已有 App 根据固定命名空间和 App ID 生成确定性
`appInstanceId`，将 `controlRevision` 初始化为 `0`；新建 App 使用随机 UUID。
不为历史成功 Deployment 伪造 Operation，旧未完成 Deployment 由后续恢复流程处理。

### 6.2 `hubAppOperations`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | Operation ID |
| `appId` / `appInstanceId` | string | App 及其实例身份 |
| `deploymentId` | string/null | 对应 Deployment，Remove 后置空 |
| `kind` | string | `deploy` 或 `rollback` |
| `controlRevision` | bigint | 接纳时的 Hub 控制版本 |
| `idempotencyKey` | string/null | App 实例内的请求幂等键 |
| `requestSnapshot` | json | 不可变请求摘要 |
| `fingerprint` | string | 请求内容 SHA-256 |
| `status` / `phase` | string | Operation 生命周期和执行阶段 |
| `attempt` | integer | PR 2 固定为 `1` |
| `hostInstanceId` | string/null | Host 进程实例 |
| `result` / `error` | json/null | 脱敏后的结果和错误摘要 |
| 时间字段 | datetime | `createdAt`、`updatedAt`、`startedAt`、`finishedAt` |

约束和索引：

- `id` 为主键；
- 非空 `idempotencyKey` 在同一 `appInstanceId` 内唯一；
- `(appInstanceId, controlRevision)` 唯一；
- 按 `appInstanceId + status + updatedAt` 和
  `appInstanceId + createdAt` 建立查询索引；
- 不设置 `deploymentId` 的数据库级联删除。

### 6.3 Host Operation Store

Host Store 与 revision cache、DeploymentCatalog 分开，放在 Host 私有管理目录。
每条记录至少保存 Operation 身份、App 实例、控制版本、fingerprint、执行阶段、
checkpoint、Host revision、错误、完成时间和 Hub ack 状态。

Store 需要支持接收记录、阶段更新、重复 submit/query/ack、当前控制版本查询，
并使用临时文件写入后 rename 的方式进行原子替换。Host 进程内的
`operationPromise` 只用于串行化当前进程内的执行，不能作为幂等和结果确认依据。

本 PR 不执行启动扫描，不删除未 ack 的 Operation 或 checkpoint。

## 7. 改动范围

本 PR 不新增独立插件、npm 包或通用消息模块，只修改：

| 包 | 主要改动 |
| --- | --- |
| `@nocobase/app-plugin-hub` | Operation 表、接纳事务、Coordinator、查询接口、生命周期门禁和终局收尾 |
| `@nocobase/app-host` | Operation IPC、Host Store、checkpoint、managed Host 执行阶段和恢复兼容 |

### 7.1 `@nocobase/app-plugin-hub`

- `server/tokens.ts`：Operation、snapshot、result、query 类型和
  `HubOperationRequestOptions`；
- `server/services/hub.ts`：Deploy/Rollback 接纳、控制版本、幂等控制、生命周期
  门禁和启动恢复入口；
- `server/services/operation-store.ts`：Operation 创建、查询、条件更新和终局收尾；
- `server/services/operation-coordinator.ts`：提交、状态同步和 ack 调度；
- `server/providers/hub.ts`：初始化和关闭 Coordinator；
- `server/routes/index.ts`：读取幂等键、返回 `operationId`、增加查询接口；
- `database/migrations/`：增加 `hubApps` 字段和 `hubAppOperations` 表。

### 7.2 `@nocobase/app-host`

- `src/management/types.ts`：Operation 请求、阶段、checkpoint、结果和查询类型；
- `src/management/ipc.ts`：submit/query/ack 和响应校验；
- `src/management/manager.ts`：managed Host Operation 管理入口；
- `src/supervisor.ts`：生成并传递 `hostInstanceId`；
- `src/management/managed-reconciler.ts`：执行阶段 checkpoint 和恢复兼容；
- `src/management/operation-store.ts`：Host Store、原子写入、查询和 ack。

不修改 `@nocobase/app-client`、`@nocobase/app-server`、`@nocobase/db` 及
Runtime、ArtifactResolver、DeploymentCatalog、App Registry。

## 8. 测试和验收

### 8.1 Hub

- 并发请求只有一个活动 Operation；
- 事务失败不产生半条 Operation；
- 相同 key/fingerprint 返回原 Operation，不同 fingerprint 返回 409；
- 重复完成通知不重复更新当前成功版本；
- 成功时 Operation、Deployment、`currentDeploymentId` 和
  `activeOperationId` 一起收尾；
- 失败时保留上一条成功 Deployment；
- 活动 Operation 存在时，生命周期操作和配置修改被拒绝；
- 查询遵守 App 归属和 `read-deployment` 权限；
- 202 响应包含 `id`、`operationId` 和状态。

### 8.2 Host 和 IPC

- Host 在返回 accepted 前已写入 Operation Store；
- 重复 submit 不重复切换 Runtime；
- 错误身份、fingerprint、App 实例和旧控制版本被拒绝；
- checkpoint 可安全写入和读取；
- query 可读取 accepted、执行阶段和最终结果；
- 重复 ack 不重复清理或修改记录；
- standalone Host 现有行为不回归。

### 8.3 阶段性验收边界

本 PR 完成：

```text
Deploy/Rollback
  -> Hub 事务创建 Operation 和 Deployment
  -> Host 持久化接收记录
  -> 执行阶段写入 checkpoint
  -> Hub 完成幂等终局收尾
  -> 返回 operationId 并支持查询
```

后续 PR 完成：

```text
Hub/Host 重启
  -> 自动找到未终局 Operation
  -> 查询 Host 结果
  -> 判断 switching 是否已经生效
  -> 进入 needs-attention 或执行人工 Retry/Close
```

## 9. 发布影响

实现本方案需要：

- `@nocobase/app-plugin-hub` 和 `@nocobase/app-host` changeset；
- 新增数据库 migration 及真实数据库测试；
- 更新 Hub、Host 和 IPC 相关测试。
