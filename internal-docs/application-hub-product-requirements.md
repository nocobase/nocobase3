---
title: Application Hub 产品需求与首期交付说明
description: 面向产品、开发和测试同事的 Application Hub 首期产品模型、用户流程、部署机制、存储结构与能力边界说明。
---

# Application Hub 产品需求与首期交付说明

## 1. 文档目的

本文档用于向产品、开发和测试同事说明 Application Hub 首期解决的问题、用户可见流程和底层实现边界。

这不是一份长期架构蓝图。文档中的“当前实现”均对应本 PR 已有行为；“后续规划”不应被理解为首期交付承诺。当前 PR 仍在联调和缺陷修复阶段，本文档描述产品语义和目标行为，不代表所有实际场景已完成验收。

## 2. 背景与目标

NocoBase Hub 需要一个面向应用开发和运维的统一工作台，使系统管理员可以：

- 先创建稳定的 App 身份，再由开发者创建对应项目；
- 上传一个或多个不可变的 Release 制品；
- 选择 Release 和配置方式发起一次 Deployment；
- 查看部署进度、历史、错误和当前 Runtime 状态；
- 对指定 App 执行访问、启动、停止、回滚和移除；
- 在 Hub 重启后恢复 App 的期望运行状态，且不阻塞 Hub 自身就绪。

首期目标是打通单 Hub、单 Host、进程内 App 的完整管理闭环，并为后续远程 Host、多环境和 Kubernetes 部署保留清晰的领域模型。

## 3. 核心产品模型

### 3.1 App

App 是用户管理的稳定对象，包含 App ID、名称、访问路径、启动策略和当前成功 Deployment 指针。

App 不等于某个版本，也不等于当前运行的进程。即使尚未上传制品或当前已停止，App 身份仍然存在。

### 3.2 Release

Release 是一次上传的不可变构建制品，由独立 ID 和 SHA-256 checksum 唯一标识。

- Release 的版本号来自制品内 `package.json`，上传时不再手工输入；
- 版本号是用户可读标签，不是构建唯一键；
- 同一版本号可以上传多个不同构建，它们保留不同的 Release ID 和 checksum；
- 上传 Release 只会存储和校验制品，不会自动部署或启动 App。

### 3.3 Deployment

Deployment 是“把某个 Release 和某份配置应用到 App”的一次不可变操作记录。

每次首次部署、二次部署或回滚都会新建 Deployment。历史 Deployment 不会被改写成“当前版本”。App 只保存一个指向当前成功 Deployment 的指针。

Deployment 记录的是业务历史，本地已展开制品则只是加速缓存。两者的保留策略彼此独立。

### 3.4 Runtime

Runtime 是 Host 上 App 的实际运行实例。Runtime 状态以 Host 实时查询结果为准，Hub 数据库不把它持久化为权威状态。

| 页面状态 | Host 状态    | 含义                                                   |
| -------- | ------------ | ------------------------------------------------------ |
| Ready    | `registered` | 制品已部署并注册，但 Runtime 尚未激活；常见于 lazy App |
| Running  | `running`    | Runtime 已激活，可处理请求                             |
| Stopped  | `stopped`    | 已部署，但用户已要求停止                               |
| Failed   | `failed`     | Host 在展开、校验、注册或启动过程中失败                |
| Unknown  | `unknown`    | Hub 无法连接 Host，不推测实际状态                      |

Deployment 的 `queued` / `deploying` / `succeeded` / `failed` 是操作状态，不是 Runtime 状态。例如 Deployment 可以已经 `succeeded`，而采用 lazy 启动策略的 App 仍显示 Ready。

## 4. 信息架构

### 4.1 Applications 列表

Hub 不再保留独立 Home page，登录后以 Applications 作为主入口。

列表页提供：

- App 卡片与紧凑列表两种布局；
- 按名称或 App ID 搜索；
- 展示当前 Runtime 状态和当前 Release；
- 创建 App；
- 点击 App 进入详情工作台。

### 4.2 App 详情

详情页顶部集中展示 App 名称、ID、访问路径、Runtime 状态、当前 Release、启动策略和更新时间，不再设置信息重复的 Overview tab。

页面按职责划分为：

| Tab           | 用途                                                                     | 显示条件                            |
| ------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| Development   | 展示 `create-app` 初始化命令                                             | 尚无 Release 时显示，并作为默认 tab |
| Deployments   | 发起部署，查看部署历史、进度、错误和回滚入口                             | 始终显示                            |
| Releases      | 上传和查看不可变制品                                                     | 始终显示                            |
| Resources     | 按 Databases、Drives、Caching、LLM services 分类展示可安全暴露的运维摘要 | 始终显示                            |
| Configuration | 查看当前 Deployment 选定的配置来源，并在 Config file 模式下编辑文件      | 至少有一次成功部署后显示            |
| Settings      | 管理启动策略和删除 App                                                   | 始终显示                            |

有 Deployment 历史的 App 默认进入 Deployments；有 Release 但尚未部署的 App 默认进入 Releases。

## 5. 核心用户流程

### 5.1 创建应用与开发引导

1. 系统管理员填写 Application name 和不可变的 Application ID。
2. Hub 创建 App 身份，初始状态为未部署。
3. 因为尚无 Release，详情页默认打开 Development。
4. Development 提供带 App ID 的 `create-app` 命令和复制入口，开发者在本地创建、开发并构建项目。
5. 构建完成后，开发者回到 Releases 上传制品。

### 5.2 上传 Release

1. 用户在 Releases 中选择 `.tar.gz` 制品。
2. Hub 检查大小、安全路径、`package.json`、版本号和 `dist/server/embedded.js`。
3. 如果根目录包含 `config.yml`，Hub 同时读取并验证其作为部署配置模板。
4. 校验通过后，Hub 将原始制品写入 Drive，并新建 Release 记录。
5. 上传完成后不自动发起 Deployment。

当前单个制品上限为 256 MiB。

### 5.3 首次部署

Deploy 入口属于 Deployments，而不是 Releases。因为“部署”产生的是一次 Deployment 操作，Release 只是被选择的输入。

部署弹窗使用固定宽度的三步流程：

1. **Release**：选择要部署的具体构建，同版本构建通过 checksum 摘要区分。
2. **Configuration**：选择 Config file 或 External，并在需要时编辑 `config.yml`。
3. **Review**：确认 App、Release 和配置来源后提交。

首次使用 Config file 时，若 Release 携带 `config.yml`，则自动作为初始内容；否则使用空 YAML 配置。

提交后 Hub 立即创建 `queued` Deployment 并返回 HTTP 202，页面转到 Deployments 并轮询进度，不要求用户保持部署弹窗打开。

### 5.4 二次及后续部署

后续部署与首次部署使用同一流程，但有两个重要默认行为：

- 默认选中当前 Release，用户可切换到新 Release 或其他构建；
- 当前 Deployment 使用 Config file 时，新 Deployment 默认复用当前配置内容，Release 内新的模板不会自动覆盖已有配置。

新 Deployment 成功前，`currentDeploymentId` 仍指向上一次成功部署。如果新版本展开、校验或启动失败，历史中会保留失败记录，但不会把当前成功 Deployment 指针切过去。

### 5.5 回滚

回滚入口位于 Deployments 历史。

1. 用户选择一条历史成功 Deployment。
2. Hub 读取该记录的 Release 和配置快照。
3. Hub 新建一条 `kind=rollback` 的 Deployment，并记录回滚目标。
4. 后续执行流程与普通部署完全相同。

如果目标 Release 的已展开 revision 仍在本地，Host 直接复用缓存；如果已被清理，Host 从原始 Release 制品重新展开。两种情况的产品语义相同，差异只在速度。

### 5.6 配置管理

部署时的配置来源有三个产品选项：

| 选项        | 当前状态   | 行为                                                          |
| ----------- | ---------- | ------------------------------------------------------------- |
| Config file | 可用       | Hub 为本次 Deployment 保存 YAML 快照，Host 把文件路径传给 App |
| Hub managed | 预留、禁用 | 未来由 Hub 数据库保存结构化配置和密钥                         |
| External    | 可用       | Hub 不生成或挂载配置文件，由外部运行环境提供                  |

Configuration tab 只展示当前 Deployment 已选定的配置方式，不允许在该 tab 内直接切换来源。如需更换来源，必须发起新 Deployment。Config file 的内容可在部署后编辑并保存；当前实现不会因保存配置自动重启 App。

### 5.7 启动、停止、访问和刷新

| 操作           | 可用条件                                                | 产品行为                                                 |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Refresh status | App 存在                                                | 重新向 Host 获取该 App 的实时 Runtime 状态               |
| Visit          | App 已部署、Host URL 可用，且状态为 Ready 或 Running    | 在新页签打开 App；Ready 的 lazy App 会由首次请求触发激活 |
| Start          | App 已部署、当前未 Running，且没有正在进行的 Deployment | 立即激活 App，但不改变下次 Hub 重启时的 eager/lazy 策略  |
| Stop           | 当前为 Running                                          | 销毁 Runtime，保留 App、Release、Deployment、配置和数据  |

不可用的操作保持可见但显示为 disabled，避免用户无法判断功能是否存在。

### 5.8 启动策略与 Hub 重启

Startup 是 App 级 Settings，不是每次部署的选项：

- **Start with Hub (`eager`)**：对于期望为运行的 App，Hub 启动后自动激活 Runtime；
- **Start on first visit (`lazy`)**：对于期望为运行的 App，Hub 启动后只注册 App，首次访问时再激活 Runtime。

Startup 策略与用户是否已执行 Stop 是两个独立维度。Stop 会把 App 的期望运行状态保存为 stopped；这种情况下，即使 Startup 为 eager，Hub 重启也不会违背用户的 Stop 选择。用户需先执行 Start 恢复期望运行状态。

Hub 启动时只等待受管 Host 可用，然后在后台下发完整 Deployment Set。App 恢复不阻塞 Hub 就绪。

若 Hub 在部署过程中重启，当时仍为 `queued` 或 `deploying` 的记录会被标记为失败，用户可再次发起部署。当前没有跨 Hub 进程的持久化任务 Worker。

### 5.9 移除 App

Remove 是不可撤销的破坏性操作，需要二次确认。执行后会移除：

- Host 中的注册与 Runtime；
- App 记录；
- Release 元数据和原始制品；
- Deployment 历史；
- 已展开 revision 缓存；
- App 配置和持久化 volume。

## 6. 部署执行机制

### 6.1 异步操作

Deploy 和 Rollback 不在 HTTP 请求中同步等待整个部署完成。Hub 先持久化操作记录并返回 202，再由进程内 runner 执行。

同一 App 的操作按顺序排队，避免同时修改同一 App。不同 App 可以在 Hub 侧各自排队，但首期单 Host 内部仍通过一条操作队列串行执行 reconciliation，以控制启动负载和 revision 顺序。

### 6.2 制品准备与缓存

Host 收到部署后：

1. 以 checksum 查找 App 对应的已展开 revision。
2. 缓存命中时，校验本地安装元数据和目录结构后直接复用。
3. 缓存未命中时，从 Drive 读取原始制品、计算 checksum，并展开到临时 staging 目录。
4. 校验 App 身份、版本、必需入口和文件安全性。
5. 将 staging 目录原子重命名为 checksum revision 目录。
6. 在部署成功后异步清理较旧 revision，每个 App 保留最近使用的 3 个已展开构建。

3 个 revision 只是本地加速缓存，不限制 Release 数量或 Deployment 历史数量。已被清理的历史版本仍可以回滚，只是需要重新下载和展开。

Deployments 页会将成功操作标记为 Cached 或 Expanded，这是性能信息，不改变部署结果的业务语义。

### 6.3 Runtime 替换

当前采用 start-first 替换：

1. 旧 Runtime 保持服务。
2. Host 使用新 revision 和新配置创建新 Runtime。
3. 新 Runtime 启动成功后，Host 才切换流量指向。
4. 旧 Runtime 在有界的优雅排空时间内完成已接收请求，然后销毁。
5. 新 Runtime 启动失败时，旧 Runtime 和当前成功 Deployment 保持不变。

该机制可以缩小常规 HTTP 请求的中断窗口，但不承诺严格零中断。长连接、WebSocket、进程内状态以及不兼容的数据库 migration 都需要单独策略。

App 的 migration 和 seed 仍在 App Runtime 启动过程中执行，因此它们的耗时会直接计入部署的启动阶段。当前不提供数据库 migration 自动回滚。

## 7. 存储目录与生命周期

```text
storage/
├── app-artifacts/
│   └── <appId>/<releaseId>.tar.gz
├── app-deployments/
│   └── <appId>/
│       └── revisions/
│           └── <sha256>/
│               ├── .nocobase-artifact.json
│               ├── package.json
│               ├── dist/
│               └── public/storage -> app-volumes/<appId>/storage/app/public
└── app-volumes/
    └── <appId>/
        ├── configs/
        │   └── <deploymentId>.yml
        └── storage/
            └── app/public/
```

三类数据必须区分生命周期：

- `app-artifacts` 保存不可变原始 Release，是未命中缓存时重新部署和回滚的来源；
- `app-deployments` 保存可再生成的展开 revision，是有上限的本地缓存；
- `app-volumes` 保存配置和 App 产生的持久化数据，不随普通重新部署被替换。

`public/storage` 是部署目录内的运行时符号链接，使不可变代码目录中的公开文件路径指向可持久化 volume。用户上传的图片、附件等公开文件因此不会在更换 Release 时丢失。制品自身不允许携带这个或其他符号链接；该链接只能由受信任的 Runtime 准备流程创建，且目标必须精确指向当前 App 的 volume。

## 8. 数据模型与状态权威

### 8.1 `hubApps`

| 字段                     | 含义                                             |
| ------------------------ | ------------------------------------------------ |
| `id`                     | 稳定 App ID，同时用于路径和存储隔离              |
| `name`, `description`    | 用户可读信息                                     |
| `currentDeploymentId`    | 当前成功 Deployment 指针，失败操作不更新它       |
| `enabled`                | Hub 期望 App 处于可运行状态；Stop 将其设为 false |
| `basePath`               | App 对外访问路径，当前默认为 `/<appId>`          |
| `backend`                | 运行后端，首期固定为 `in-process`                |
| `startupMode`            | Hub 重启后使用 `eager` 或 `lazy` 激活            |
| `createdAt`, `updatedAt` | 审计时间                                         |

### 8.2 `hubAppReleases`

| 字段             | 含义                                   |
| ---------------- | -------------------------------------- |
| `id`, `appId`    | Release 身份及所属 App                 |
| `version`        | 来自制品的版本标签，不要求唯一         |
| `artifactKey`    | Drive 中原始制品的不可变位置           |
| `checksum`       | 制品内容校验和展开缓存键               |
| `size`           | 制品大小                               |
| `configTemplate` | Release 根目录 `config.yml` 的可选模板 |
| `manifest`       | 上传时读取的 `package.json` 元数据     |
| `createdAt`      | 上传时间                               |

### 8.3 `hubAppDeployments`

| 字段                                   | 含义                                                              |
| -------------------------------------- | ----------------------------------------------------------------- |
| `id`, `appId`, `releaseId`             | 操作身份、所属 App 和目标 Release                                 |
| `kind`                                 | `deploy` 或 `rollback`                                            |
| `rollbackTargetDeploymentId`           | 回滚操作指向的历史 Deployment                                     |
| `previousDeploymentId`                 | 操作发起时的上一个当前 Deployment                                 |
| `status`                               | `queued`、`deploying`、`succeeded`、`failed` 或预留的 `cancelled` |
| `phase`                                | 用于展示当前执行阶段                                              |
| `config`                               | 本次部署的配置来源和可选文件路径                                  |
| `cacheHit`                             | 本次是复用已展开 revision 还是重新展开                            |
| `hostRevision`                         | Host 接受该操作时的 reconciliation revision                       |
| `error`                                | 失败原因，页面完整展示并允许复制                                  |
| `createdAt`, `startedAt`, `finishedAt` | 排队、开始和完成时间                                              |

Hub 数据库是 App 设置、Release、Deployment 历史和当前成功 Deployment 指针的权威来源。Host 是当前 Runtime 状态、已注册定义和已展开缓存的权威来源。

## 9. 权限与安全边界

- Hub 管理 API 仅允许 `system-administrator` 访问；
- 制品上传同时校验声明大小和实际流大小；
- tar 条目不能逃逸展开目录，不接受制品中的符号链接；
- checksum 不匹配时拒绝部署；
- App ID 限制为字母、数字、下划线和连字符，用于避免路径和身份歧义；
- Config file 以原子写入方式保存，并校验 YAML 根节点为对象。

## 10. 当前交付范围

本 PR 已打通：

- Hub 中的 Applications 主入口、卡片/列表、搜索和 App 详情；
- 无 Release App 的 Development 引导；
- Release 上传、元数据读取、安全校验和 Drive 存储；
- Release、Configuration、Review 三步部署；
- 异步 Deployment 记录、进度轮询、完整错误展示与复制；
- 从成功 Deployment 创建新回滚操作；
- 按 checksum 缓存不可变 revision，每 App 保留 3 个已展开构建；
- start-first Runtime 替换和有界优雅排空；
- 指定 App 的 Refresh、Visit、Start、Stop 和 Remove；
- eager/lazy 启动策略，以及 Hub 启动时的非阻塞后台恢复；
- 基于配置 key 的 Databases、Drives 和 Caching 非敏感摘要展示，以及 LLM services 预留页面。

## 11. 当前边界与非目标

- 只支持一个由 Hub 拉起的本地 managed Host；
- App Runtime 只支持 `in-process`，尚无 Worker、Process 或容器隔离；
- 尚无远程 Host、多 Host、多 Environment 和调度能力；
- 部署 runner 位于 Hub 进程内，不是独立持久化任务系统；
- `cancelled` 已在状态模型中预留，但尚无取消部署操作；
- 尚无独立 Retry 动作，失败后通过再次 Deploy 或 Rollback 创建新记录；
- Hub managed 配置仅占位，尚未实现数据库配置与密钥管理；
- Resources 当前主要从非敏感配置摘要推导，不是完整的资源管理 API；
- 没有 Release 或 Deployment 历史的自动保留策略，“保留 3 个”只适用于 Host 本地已展开缓存；
- start-first 不是严格零中断发布，不包含数据库 schema 兼容性、长连接迁移或自动 migration 回滚保证；
- Remove 是完整删除，当前不提供软删除或恢复站。

## 12. 后续演进方向

后续可在不改变 App、Release、Deployment 三层产品模型的前提下逐步扩展：

1. 将进程内 deployment runner 升级为可恢复、可重试、可取消的持久化任务系统。
2. 增加分阶段日志、耗时分析、健康检查和失败诊断。
3. 实现 Hub managed 配置、Secret 和配置发布。
4. 增加 Release 删除、引用保护与可配置保留策略。
5. 支持远程 Host、多环境、多 Host 调度与权限隔离。
6. 增加 standalone Process/Worker 后端和 Kubernetes Deployment Driver。
7. 针对数据库 migration 建立预检查、兼容性约束和独立发布策略。

## 13. 建议的验收主线

为避免只验证单个按钮，建议按以下主线做端到端验收：

1. 创建 App，确认 Development 为默认 tab，Visit/Start/Stop 均不可用。
2. 上传带 `config.yml` 的首个 Release，确认只生成 Release，不会自动部署。
3. 从 Deployments 发起首次部署，完成 Release、Configuration、Review 三步确认。
4. 确认请求返回后页面可继续操作，Deployment 从 queued/deploying 进入 succeeded 或 failed。
5. 部署成功后验证 Visit、Refresh、Start/Stop 的可用条件和 Runtime 状态。
6. 上传同版本的第二个构建，确认两个 Release 可通过 checksum 区分。
7. 部署新构建，确认新 Deployment 成功前旧 App 仍可用，失败时当前指针不变。
8. 回滚到历史成功 Deployment，确认新增 rollback 记录，并分别验证 Cached 与 Expanded 路径。
9. 重启 Hub，确认 Hub 本身不等待全部 App 启动；期望运行的 eager App 最终 Running，lazy App 最终 Ready，已 Stop 的 App 仍保持 Stopped。
10. 验证配置和 `public/storage` 数据在二次部署与 Hub 重启后仍保留。
11. 构造失败制品，确认完整错误可见、可选中且可一键复制。
12. 移除 App，确认数据库记录、原始制品、revision 和 volume 都按预期删除。
