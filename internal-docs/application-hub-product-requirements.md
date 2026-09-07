---
title: Application Hub 产品需求与首期交付说明
description: 面向产品、开发和测试同事的 Application Hub 首期产品模型、用户流程、部署机制、存储结构与能力边界说明。
---

# Application Hub 产品需求与首期交付说明

## 1. 文档目的

本文档用于向产品、开发和测试同事说明 Application Hub 首期解决的问题、用户可见流程和底层实现边界。

本文按当前分支实现整理，已合并原 Host / Hub 职责拆分进度文档（2026-09-07）。文档中的“当前实现”和“待完善”分别说明已经落地的行为与尚未交付的能力，不代表所有实际场景已完成验收。尤其是部署通信中断后的结果协调，尚不能按生产闭环验收。

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

Deployment 是“把某个 Release 和某份配置应用到 App”的一次操作记录。执行期间状态和结果会更新，但不会把旧记录重新用作一次新的部署。

每次首次部署、二次部署或回滚都会新建 Deployment。历史 Deployment 不会被改写成“当前版本”。App 只保存一个指向当前成功 Deployment 的指针。

Deployment 记录的是业务历史，本地已展开制品则只是加速缓存。两者的保留策略彼此独立。

记录中的配置 binding 也不等于不可变配置快照：当前配置可以另行发布，旧配置文件会清理。因此历史部署不保证能还原当时的配置正文。

### 3.4 Runtime

Runtime 是 Host 上 App 的实际运行实例。Runtime 状态以 Host 实时查询结果为准，Hub 数据库不把它持久化为权威状态。

| 页面状态 | Host 状态    | 含义                                                   |
| -------- | ------------ | ------------------------------------------------------ |
| Pending  | `pending`    | Host 已接收目标，正在等待或执行应用准备、启动 |
| Running  | `running`    | Runtime 已激活，可处理请求                             |
| Stopped  | `stopped`    | 当前没有运行中的 Runtime；包括 lazy 尚未首次访问或用户已停止 |
| Failed   | `failed`     | Host 在展开、校验、注册或启动过程中失败                |
| Unknown  | `unknown`    | Hub 无法连接 Host，不推测实际状态                      |

Deployment 的 `queued` / `deploying` / `succeeded` / `failed` 是操作状态，不是 Runtime 状态。例如 Deployment 可以已经 `succeeded`，而采用 lazy 启动策略的 App 仍显示 Stopped。`registered` 是注册概念，不再作为页面运行状态；`eager` / `lazy` 是启动策略，也不是状态。

## 4. 信息架构

### 4.1 Applications 列表

Hub 不再保留独立 Home page，登录后以 Applications 作为主入口。

列表页提供：

- App 卡片与紧凑列表两种布局；
- 按名称或 App ID 搜索；
- 展示当前 Runtime 状态和当前 Release；
- 创建 App；
- 手动刷新列表状态，不对整个应用列表持续轮询；
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

有当前成功 Deployment 的 App 默认进入 Deployments；有 Release 但尚无成功部署的 App 默认进入 Releases。详情与列表分开请求，历史、Release、配置和资源内容按选中的 tab 加载。当前详情有未完成部署或 Runtime 为 Pending 时，每 1.5 秒刷新该 App 详情；在 Deployments tab 同时刷新历史，保留原表格内容，不用整页 loading 替换。

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
3. 如果根目录包含 `config.example.yml` 或 `config.example.yaml`，Hub 同时读取并按 YAML 验证其作为部署配置模板。两者不能同时存在，制品中的真实 `config.yml` 不会被读取为模板。
4. 校验通过后，Hub 将原始制品写入 Drive，并新建 Release 记录。
5. 上传完成后不自动发起 Deployment。

当前单个制品上限为 256 MiB。

### 5.3 首次部署

Deploy 入口属于 Deployments，而不是 Releases。因为“部署”产生的是一次 Deployment 操作，Release 只是被选择的输入。

部署弹窗使用固定宽度的三步流程，各步骤切换时不改变弹窗尺寸：

1. **Release**：选择要部署的具体构建，同版本构建通过 checksum 摘要区分。
2. **Configuration**：选择 Config file 或 External，并在需要时编辑本次部署的 YAML 配置。
3. **Review**：确认 App、Release 和配置来源后提交。

Configuration 默认左右布局：左侧 Current 只读，右侧 New configuration 可编辑，可按差异块将当前值带入右侧，不会修改正在使用的生产配置。图标组支持只看左侧、双栏或只看右侧。Review 使用只读单栏 diff；即使两者相同，也明确显示 `No configuration changes`；首次部署时 Current 显示无当前配置。

首次使用 Config file 时，若 Release 携带 `config.example.yml` 或 `config.example.yaml`，New configuration 自动使用该模板，并明确提示用户在继续前替换示例值、占位符、凭据和密钥；否则使用空 YAML 配置。模板后缀不影响实际文件格式，目标和运行文件统一使用 `.yml`，具体命名见第 7 节。

选择 Release 时不立即读取模板；进入 Configuration 步骤后才加载。加载失败显示错误和 Retry，并禁止继续 Review，避免将旧配置误认为新 Release 的模板。返回上一步后仍选择同一 Release 会保留编辑；改选 Release 后重新加载。

提交后 Hub 立即创建 `queued` Deployment 并返回 HTTP 202，页面转到 Deployments 并轮询进度，不要求用户保持部署弹窗打开。

### 5.4 二次及后续部署

后续部署与首次部署使用同一流程，默认行为如下：

- 默认选中当前 Release，用户可切换到新 Release 或其他构建；
- 所选 Release 包含 `config.example.yml` 或 `config.example.yaml` 时，它直接成为右侧 New configuration，用来与左侧 Current configuration 比较；不增加额外的“使用模板”操作；
- 所选 Release 不包含配置示例时，若存在当前 Config file 配置则继承它，避免意外清空；首次部署则使用空配置。

切换 Release 后，进入 Configuration 时将右侧重置为新 Release 对应的初始配置。页面实时校验 YAML 根节点、显示差异，并在配置无效时禁止进入 Review。

新 Deployment 成功前，`currentDeploymentId` 仍指向上一次成功部署。如果新版本展开、校验或启动失败，历史中会保留失败记录，但不会把当前成功 Deployment 指针切过去。

### 5.5 回滚

回滚入口位于 Deployments 历史。

1. 用户选择一条历史成功 Deployment。
2. Hub 固定该记录的 Release 和配置来源。配置来源决定 App 如何加载配置，回滚时不能修改。
3. 用户依次完成 Configuration 和 Review。目标为 Config file 时，右侧优先使用目标 Release 的配置示例；没有示例时使用当前配置，并允许在提交前调整内容。目标为 External 时不展示编辑器。
4. 页面默认并列展示当前配置和目标配置，也可隐藏其中一栏；Review 使用单栏 diff。
5. Hub 新建一条 `kind=rollback` 的 Deployment，记录回滚目标，继承目标 Deployment 的配置来源；Config file 使用本次新建的配置路径，而不是复用已清理的历史文件。
6. 后续执行流程与普通部署完全相同。

如果目标 Release 的已展开 revision 仍在本地，Host 直接复用缓存；如果已被清理，Host 从原始 Release 制品重新展开。两种情况的产品语义相同，差异只在速度。

### 5.6 配置管理

部署时的配置来源有三个产品选项：

| 选项        | 当前状态   | 行为                                                                                  |
| ----------- | ---------- | ------------------------------------------------------------------------------------- |
| Config file | 可用       | Hub 保存目标 YAML 文件和 Deployment 的 mode/path binding；通过管理协议传内容给 Host，由 Host 写运行文件并把路径传给 App |
| Hub managed | 预留、禁用 | 未来由 Hub 数据库保存结构化配置和密钥                                                 |
| External    | 可用       | Hub 不生成或挂载配置文件，由外部运行环境提供                                          |

Configuration tab 展示当前成功 Deployment 固化的配置来源。Config file 可以直接编辑，点击 **Save and publish** 后先 Review，以只读单栏 diff 确认修改，再发布。不创建 Deployment，也不重启 App。配置来源不能在此切换，配置文件路径不在前端展示或编辑。

发布时，Hub 先保存目标文件，Host 再通过执行队列原子更新运行文件，并对已激活的 Runtime 调用 config reload。未激活的 App 不会为了发布配置而启动。reload 只代表配置重新加载，不代表所有服务都支持热更新；依赖启动时初始化的配置仍可能需要 Restart，页面会提示这一点。

若目标文件保存成功、Host 发布或 reload 失败，API 明确报告“配置已保存，但运行时 reload 失败”。这不是全链路事务，也不会自动撤回目标文件，不能将保存成功等同于运行中服务已应用全部修改。

Config file 是整文件管理模式，可能包含数据库口令、认证密钥等敏感数据。Hub 目标文件和 Host 运行文件均在非公开目录，配置目录和文件分别使用 `0700`、`0600`，采用原子写入，配置读取响应禁止缓存。该模式允许系统管理员查看明文，不提供字段级脱敏或 Secret Store。

真实配置不写入数据库；`hubAppReleases.configTemplate` 仍以明文保存 Release 携带的示例模板，因此制品模板不能包含真实凭据。当前不实现独立配置版本控制；以 Deployment ID 命名文件是为隔离候选和当前配置，不是保留历史配置的承诺，也不与“3 个展开缓存”绑定。

### 5.7 启动、停止、访问和刷新

| 操作           | 可用条件                                                | 产品行为                                                 |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Refresh status | App 存在                                                | 重新向 Host 获取该 App 的实时 Runtime 状态               |
| Visit          | Host 可用，App Running；或已部署、enabled 的 lazy App 为 Stopped | 在新页签打开 App；后者由首次请求触发激活 |
| Start          | App 已部署、当前未 Running，且没有正在进行的 Deployment | 立即激活 App，但不改变下次 Hub 重启时的 eager/lazy 策略  |
| Stop           | 当前为 Running                                          | 销毁 Runtime，保留 App、Release、Deployment、配置和数据  |

Running 时原 Start 位置显示 Restart，由 Host 在一次队列操作中完成停止和启动。Start、Stop、Restart 均需二次确认；存在部署或启动过程时禁用冲突操作。未部署时 Visit 禁用。

不可用的操作保持可见但显示为 disabled，避免用户无法判断功能是否存在。

### 5.8 启动策略与 Hub 重启

Startup 是 App 级 Settings，不是每次部署的选项：

- **Start with Hub (`eager`)**：对于期望为运行的 App，Hub 启动后自动激活 Runtime；
- **Start on first visit (`lazy`)**：对于期望为运行的 App，Hub 启动后只注册 App，首次访问时再激活 Runtime。

Startup 策略与用户是否已执行 Stop 是两个独立维度。Stop 会把 App 的期望运行状态保存为 stopped；这种情况下，即使 Startup 为 eager，Hub 重启也不会违背用户的 Stop 选择。用户需先执行 Start 恢复期望运行状态。

Hub 启动时只等待受管 Host 可用，然后在后台下发完整 Deployment Set。App 恢复不阻塞 Hub 就绪。

恢复目标包含所有有当前成功 Deployment 的 App，不只是 eager App：需要保留 lazy 和 stopped App 的定义，供之后访问或手动 Start 使用。恢复复用已部署 revision 的恢复路径，不创建新的 Deployment 历史，也不把每次 Host 启动当成重新上传、重新部署制品；运行文件则由持久化目标配置重新提供。

Supervisor 只负责 Host 进程生命周期，不再保存应用部署快照。每次 Host 就绪，Hub 都从数据库当前指针、enabled、startupMode 和目标配置文件重新生成恢复请求。恢复失败会记日志，但当前没有独立重试协调器，不能保证无须干预就最终恢复成功。

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

IPC 目前先回复“已接受”，再在完成时返回最终结果；收到接受确认后，客户端取消该请求的等待超时。但最终结果仍绑定原请求 ID 和等待中的 Promise，并非独立、可恢复的后台任务协议。断线或进程退出后可能丢失结果，Hub 仍可能把通信失败记为部署失败，即使 Host 已完成切换。HTTP 202 和取消接受后的超时并未解决这类一致性问题。

### 6.2 制品准备与缓存

Host 收到部署后：

1. 以 checksum 查找 App 对应的已展开 revision。
2. 缓存命中时，校验本地安装元数据和目录结构后直接复用。
3. 缓存未命中时，从 Drive 读取原始制品、计算 checksum，并展开到临时 staging 目录。
4. 校验 App 身份、版本、必需入口和文件安全性。
5. 将 staging 目录原子重命名为 checksum revision 目录。
6. 在部署成功后异步清理较旧 revision，每个 App 保留最近使用的 3 个已展开构建。

3 个 revision 只是本地加速缓存，不限制 Release 数量或 Deployment 历史数量。已被清理的历史版本仍可以回滚，只是需要重新下载和展开。

`cacheHit` 作为 Deployment 的诊断数据保留，不单设 Artifact 列。命中时在 Status 旁显示 `Cache reused`，表示本次执行复用了已展开构建，不代表这条历史记录对应的构建现在仍在缓存中。主表同时展示可点击复制的 Deployment ID、Release、操作类型、状态、完整创建时间和操作入口。

清理由 Host 在制品成功 commit 后异步触发，保护当前 revision，按最近使用保留总计 3 个构建；命中缓存的正常部署也触发清理，启动恢复不触发这次清理。它不删除原始 Release、历史记录或 App 数据。

### 6.3 Runtime 替换

当前临时采用 stop-first 替换：

1. 停止并销毁旧 Runtime。
2. Host 使用新 revision 和新配置创建新 Runtime。
3. Host 完成运行切换后返回结果，Hub 再更新成功 Deployment 记录和当前指针；两者不是一个原子事务。
4. 新 Runtime 启动失败时，Host 尝试用旧 definition 重新创建 Runtime，成功 Deployment 保持不变。
5. 如果新 Runtime 和旧 Runtime 都无法启动，Deployment 失败并保留两次启动的错误原因。

该策略会在部署期间产生短暂访问中断，不能视为零中断部署。它是队列 Runtime 隔离完成前的安全策略，而不是最终部署架构。

采用 stop-first 的直接原因是 `@boringnode/queue` 当前将 `QueueManager`、`Locator` 和 job dispatch runtime 保存在进程级模块单例中。Hub 的 in-process backend 会在同一 Node.js 进程中运行多个 App，并且一次部署原本还会短暂并存同一 App 的新旧 Runtime。新旧 Runtime 初始化 Workflow worker 时会共享并覆盖上述队列状态，可能出现重复监听、Job 类解析到错误 Runtime，以及旧 Runtime 销毁新 Runtime 队列资源等问题。

后续需要在以下方案中做出选择，再恢复 start-first HTTP Runtime 替换：

- 推动 `@boringnode/queue` 提供完整实例 API，使 Manager、Job registry、dispatcher、executor、adapter 和 Worker 生命周期都归属于一个 App Runtime；
- 将 App 后台 Worker 放入独立进程，以进程作为模块单例的隔离边界；
- 生产队列统一使用 Redis，并评估由 BullMQ 提供实例级 Queue/Worker；
- 将队列提升为 Host 级共享服务，并显式实现 App/Runtime handler 路由和 active Runtime 交接。

无论最终选择哪种方案，持久化队列名都应归属于 App，例如 `workflow:<appId>`，不能包含 Runtime ID。Runtime ID 只用于消费者身份、日志、所有权和部署交接，避免延迟或重试任务滞留在已经销毁的部署队列中。

App 的 migration 和 seed 仍在 App Runtime 启动过程中执行，因此它们的耗时会直接计入部署的启动阶段。当前不提供数据库 migration 自动回滚。

### 6.4 Hub、Host 与 Supervisor 的职责

| 层级 | 当前负责 | 不负责 |
| --- | --- | --- |
| Hub | 持久化 App 设置、Release、部署目标和历史；保存目标配置；提交执行请求；根据结果更新记录；Host 就绪后重新下发目标 | 展开 revision、切换 Runtime、决定运行配置路径和清理 Host 运行资源 |
| Host | 校验和展开制品、缓存复用与清理、写运行配置、Runtime 启停替换、reload、移除运行目录和 volume；报告实际状态 | 访问 Hub 数据库、持久化 Hub 业务历史 |
| Supervisor | 拉起和监督 Host 进程、管理 IPC 连接、发出就绪通知 | 缓存 App 目标快照或决定恢复哪些 App |

Hub 在 managed 模式下不仅保存历史，也承担持久化控制面的职责。Host 没有数据库，其本地执行和清理无需等 Hub 写历史记录，但当前通信协议尚不能保证双方最终一致。

独立 Host 仍从本地目录取得目标，不依赖 Hub 数据库；它与 managed 模式尚未完全共用配置发布等执行入口。当前没有要求为了统一实现而扩展独立 Host 的部署产品能力。

## 7. 存储目录与生命周期

```text
storage/
├── hub/
│   ├── host-config.yml
│   └── app-configs/
│       └── <appId>/configs/config.<deploymentId>.yml
├── app-artifacts/
│   └── <appId>/<releaseId>.tar.gz
├── app-deployments/
│   └── <appId>/
│       └── revisions/
│           └── <sha256>/
│               ├── .nocobase-artifact.json
│               ├── package.json
│               └── dist/
└── app-volumes/
    └── <appId>/
        ├── configs/
        │   └── config.<deploymentId>.yml
        └── storage/
```

以上是默认目录，实际位置受 Hub/Host 存储配置影响；Hub 的 `app-configs` 位于 `host.configPath` 所在目录下。数据生命周期分别为：

- `hub/host-config.yml` 是受管 Host 自身的启动配置，不是某个 App 的配置；
- `hub/app-configs` 是 Hub 持有的目标配置，Deployment 的 `config.path` 指向这里；Hub 通过协议传递内容和 revision，不把此路径当成 Host 的运行路径；
- `app-artifacts` 保存不可变原始 Release，是未命中缓存时重新部署和回滚的来源；
- `app-deployments` 保存可再生成的展开 revision，是有上限的本地缓存；
- `app-volumes/<appId>/configs` 是 Host 写给 Runtime 读取的配置，managed 模式下 revision 使用 Deployment ID；
- `app-volumes/<appId>/storage` 是 App 产生的持久化数据，不随普通重新部署被替换。

切换期间旧配置和候选配置可以同时存在。Host 切换成功后清理旧运行配置，失败后清理独立候选配置；Hub 在成功记录新部署后清理自己的上一份目标配置，确定候选被 Host 拒绝时清理候选目标文件。通信结果不确定时会保留候选目标文件，避免提前删除可能已生效的配置。配置清理不是保留最近 3 份，也不是历史版本库。

默认 `local` Drive 直接使用 App 的 `storage` 系统目录，且不提供公开访问。Drive 不再修改不可变 revision 或创建符号链接；制品也不允许包含符号链接。公开文件目录和 HTTP 访问以后作为独立能力设计。

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

| 字段             | 含义                                                                        |
| ---------------- | --------------------------------------------------------------------------- |
| `id`, `appId`    | Release 身份及所属 App                                                      |
| `version`        | 来自制品的版本标签，不要求唯一                                              |
| `artifactKey`    | Drive 中原始制品的不可变位置                                                |
| `checksum`       | 制品内容校验和展开缓存键                                                    |
| `size`           | 制品大小                                                                    |
| `configTemplate` | Release 根目录 `config.example.yml` 或 `config.example.yaml` 的可选模板内容 |
| `manifest`       | 上传时读取的 `package.json` 元数据                                          |
| `createdAt`      | 上传时间                                                                    |

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
| `error`                                | 失败原因；表格单行摘要展示，完整内容可查看和复制                  |
| `createdAt`, `startedAt`, `finishedAt` | 排队、开始和完成时间                                              |

Hub 数据库是 App 设置、Release、Deployment 历史和当前成功 Deployment 指针的权威来源。Host 是当前 Runtime 状态、已注册定义和已展开缓存的权威来源。

当前指针代表 Hub 最后确认成功的部署，不是通信中断时 Host 实际运行版本的绝对证明。目标版本与观测版本的表达和补同步仍需完善，不能仅根据该指针认定运行切换尚未发生。

## 9. 权限与安全边界

- Hub 管理 API 仅允许 `system-administrator` 访问；
- 制品上传同时校验声明大小和实际流大小；
- tar 条目不能逃逸展开目录，不接受制品中的符号链接；
- checksum 不匹配时拒绝部署；
- App ID 限制为字母、数字、下划线和连字符，用于避免路径和身份歧义；
- Config file 以 `0600` 权限原子写入受保护目录，并校验 YAML 根节点为对象；
- 返回配置正文的 API 使用 `Cache-Control: no-store`，避免敏感配置被浏览器或代理缓存。

## 10. 当前交付范围

本 PR 已打通：

- Hub 中的 Applications 主入口、卡片/列表、搜索和 App 详情；
- 无 Release App 的 Development 引导；
- Release 上传、元数据读取、安全校验和 Drive 存储；
- Release、Configuration、Review 三步部署，以及 Current/New 双栏 YAML 代码编辑和差异展示；
- 异步 Deployment 记录、进度轮询、完整错误展示与复制；
- 从成功 Deployment 创建新回滚操作；
- 按 checksum 缓存不可变 revision，每 App 保留 3 个已展开构建；
- stop-first Runtime 替换，以及替换失败时恢复旧 Runtime；
- 指定 App 的 Refresh、Visit、Start、Restart、Stop 和 Remove，以及启停二次确认；
- Configuration 的 Save and publish、单栏 Review 和 Host 运行配置 reload；
- Hub 目标配置与 Host 运行配置分离、运行配置切换后的清理；
- Supervisor 移除部署快照，Host 就绪后由 Hub 重建恢复目标；
- Hub 页面按列表、详情、部署、Release、配置、资源和设置拆分业务模块，未改动基础 UI 组件；
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
- stop-first 在部署和恢复旧 Runtime 期间会产生短暂访问中断，且不包含数据库 migration 自动回滚保证；
- Remove 是完整删除，当前不提供软删除或恢复站。

### 11.1 尚未完成的可靠性闭环

以下是当前实现限制，不属于已经交付的能力：

- IPC 没有独立操作 ID、重复提交幂等、完成结果查询与确认，以及断线后的补同步；接受确认丢失也未解决。
- 通信失败、Host 退出或 Hub 数据库更新失败后，历史状态可能与实际运行结果不同；当前不能将“请求失败”等同于“部署未生效”。
- Hub 启动会将未完成记录终结为失败，尚未先查询执行结果。下一步如何处理被中断操作仍需实现，不能声称已支持自动续跑。
- 恢复失败只有日志和下次 Host 就绪时重新触发，没有独立的协调重试机制。
- Host 全局执行队列没有细化为每 App 并行隔离，需结合共享 QueueManager 的限制处理。
- Stop 当前会销毁 Runtime，但保留的注册定义仍存在请求重新激活风险；Hub 的 enabled 和访问按钮限制不等于 Host 请求入口已完成停用隔离。

后续补齐协议时，应区分“IPC 断线但 Host 仍在”和“Host 进程已重启”：前者可查询同一进程的操作结果，后者不能依赖已丢失的内存记录。操作 ID、提交幂等、结果查询/确认、迟到结果防覆盖和必要的持久化策略需要一起设计，不能只去掉超时。应补充重复提交、丢失接受确认、丢失完成结果、切换中途退出及数据库更新失败的故障测试。

## 12. 后续演进方向

后续可在不改变 App、Release、Deployment 三层产品模型的前提下逐步扩展：

1. 完善 Host 执行结果与 Hub 历史的协调协议、恢复重试和故障测试；再评估持久化执行日志、重试与取消能力。
2. 增加分阶段日志、耗时分析、健康检查和失败诊断。
3. 在已有文件配置发布基础上，按需设计 Hub managed、字段级 Secret 与独立配置版本管理。
4. 增加 Release 删除、引用保护与可配置保留策略。
5. 支持远程 Host、多环境、多 Host 调度与权限隔离。
6. 增加 standalone Process/Worker 后端和 Kubernetes Deployment Driver。
7. 针对数据库 migration 建立预检查、兼容性约束和独立发布策略。

## 13. 建议的验收主线

为避免只验证单个按钮，建议按以下主线做端到端验收：

1. 创建 App，确认 Development 为默认 tab，Visit/Start/Stop 均不可用。
2. 上传带 `config.example.yml` 或 `config.example.yaml` 的首个 Release，确认只生成 Release，不会自动部署。
3. 从 Deployments 发起首次部署，完成 Release、Configuration、Review 三步确认。
4. 确认请求返回后页面可继续操作，Deployment 从 queued/deploying 进入 succeeded 或 failed。
5. 部署成功后验证 Visit、Refresh、Start/Stop 的可用条件和 Runtime 状态。
6. 上传同版本的第二个构建，确认两个 Release 可通过 checksum 区分。
7. 部署新构建，确认制品准备与 stop-first 切换阶段的行为；允许切换期间访问中断，不以“全程旧 App 可用”验收。模拟新 Runtime 启动失败，验证旧 Runtime 恢复和当前指针不变。
8. 回滚到历史成功 Deployment，确认新增 rollback 记录，并分别验证 Cached 与 Expanded 路径。
9. 重启 Hub 或受管 Host，确认 Hub 不等待全部 App 启动，也不新增 Deployment；eager App 从 Pending 到 Running，lazy App 在首次访问前为 Stopped，已 Stop 的 App 不自动启动；验证后续手动 Start。另行验证第 11.1 节所述直接请求重新激活风险。
10. 验证配置和 App `storage` 数据在二次部署与 Hub 重启后仍保留。
11. 构造失败制品，确认完整错误可见、可选中且可一键复制。
12. 移除 App，确认数据库记录、原始制品、revision 和 volume 都按预期删除。
13. 编辑配置后 Save and publish，确认 Review 不修改当前文件，提交后目标文件和运行文件更新、已运行 App 出现 reload 日志；对需要重启的配置单独验证 Restart。
14. 在候选启动失败、正常切换和多次缓存淘汰后检查配置文件生命周期；历史回滚应以模板和当前配置创建新配置，不读取已清理的旧文件。
15. 模板加载失败时确认 Retry 可用且 Review 禁用，同一 Release 返回编辑保留草稿；切换 Release 后不混用旧模板。

## 14. 实现定位

- Hub 数据模型、部署 runner、目标配置、恢复与发布：`packages/plugins/app-plugin-hub/server/services/hub.ts`。
- Host 受管目标执行、配置发布和切换：`packages/app/app-host/src/management/managed-reconciler.ts`。
- Host 配置写入和路径约束：`packages/app/app-host/src/deployment/volume-manager.ts`。
- 前端入口与按 tab 请求：`packages/plugins/app-plugin-hub/client/pages/hub-page.tsx`；业务视图位于同目录 `hub/`。

本文统一维护产品行为、部署机制与职责边界，原 `host-hub-boundary-refactor.md` 不再单独维护进度。
