---
title: Hub 架构设计
description: NocoBase 3 Hub 管理系统、APP 生命周期、Release 部署与回滚、Runtime 运行机制、权限审计和 APP 配置的架构设计。
keywords: NocoBase 3,Hub,APP,Release,Deployment,Runtime,版本回滚,应用管理
---

# Hub 架构设计

Hub 是 NocoBase 3 的 APP 管理入口。开发者在本地创建和维护源码，完成构建后把可运行产物发布到 Hub；Hub 保存不可变的 Release，并负责部署、版本切换、启停、权限和审计；App Host 负责真正加载和运行 APP。

这套设计把源码开发与线上运行分开。Hub 不保存源码，也不提供 Git、源码下载或远程编辑能力。源码需要由开发者在本地使用 Git 等方式管理，Hub 只管理从源码构建出来的产物。

## 设计边界

### Hub 负责什么

- 管理 Hub 用户、成员、角色和 APP 级权限
- 创建和维护 APP 管理记录
- 接收、校验和保存不可变 Release
- 创建 Deployment，记录部署、回滚和重新部署过程
- 保存 APP 的当前激活 Release 和期望运行状态
- 管理每个 APP 独立的 Runtime Secret
- 展示 Runtime、部署记录和操作日志
- 协调本地 App Host 完成 APP 启动、停止、重启和版本切换

### Hub 不负责什么

- 保存或同步 APP 源码
- 从 Release 还原源码
- 安装 APP 源码依赖或提供远程开发环境
- 管理 Git 仓库和分支
- 自动回滚 APP 数据库或附件
- 在当前版本中为每个 APP 配置 PostgreSQL、MySQL、Redis、S3 等外部服务

### 当前部署边界

当前实现面向一个 Hub、一个本地 App Host、一个 `default` 环境。Hub 与 App Host 在同一个 Node.js 进程中启动，通过对象调用协作，不过分别监听管理端口和 APP 访问端口。

默认端口如下：

| 服务     | 默认地址                     | 用途                                |
| -------- | ---------------------------- | ----------------------------------- |
| Hub      | `http://127.0.0.1:13000/hub` | 管理页面、认证和 Hub API。          |
| App Host | `http://127.0.0.1:3000`      | 托管 APP 的页面、API 和 WebSocket。 |

APP 当前使用 `in-process` 方式运行，也就是 APP 服务端代码与 App Host 位于同一个 Node.js 进程。这个模式没有进程级安全隔离，只适合运行经过信任的 Release。

## 整体架构

```text
管理者浏览器 ───────────────────────────────► Hub /hub
业务用户浏览器 ─────────────────────────────► App Host /<app-slug>

开发者电脑
┌─────────────────────────────────────────────────────────────┐
│ APP 源码                                                    │
│                                                             │
│ pnpm dev                                                    │
│ pnpm run release / pnpm run deploy                          │
│                                                             │
│ build → dist → nocobase-release.json → release.tar.gz       │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS + Agent credential
                               ▼
Hub 服务器
┌─────────────────────────────────────────────────────────────┐
│ Hub 管理页面                                                │
│   APP / Release / Deployment / Runtime / Member / Audit     │
│                         │                                   │
│                         ▼                                   │
│ Hub API（控制面）                                           │
│   Authentication / Authorization / Idempotency / Audit      │
│        │                    │                    │           │
│        ▼                    ▼                    ▼           │
│ Hub SQLite          Release Storage        LocalHostAdapter │
│ 管理数据             不可变构建产物                │         │
│                                                  ▼         │
│                                        AppRuntimeRegistry   │
│                                        （App Host 运行面）   │
│                                                  │         │
│                                  ┌───────────────┼───────┐ │
│                                  ▼               ▼       ▼ │
│                              APP A Runtime   APP B     APP C │
│                              SQLite/Files    Runtime   Runtime│
└─────────────────────────────────────────────────────────────┘
```

### 控制面与运行面

Hub 是控制面，负责记录“应该运行哪个版本”和“应该处于什么状态”。App Host 是运行面，负责把这些期望转换成真实的 Runtime。

两者之间的主要边界如下：

| 领域             | Hub                                                        | App Host                                       |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| APP 元数据       | 保存 APP 名称、标识、状态和当前 Release。                  | 使用 APP 标识和 Release 生成运行定义。         |
| Release          | 保存产物，并在交给运行面前校验 manifest、checksum 和入口。 | 加载目标 Release 的 Client 和 Server。         |
| Deployment       | 创建操作、持久化状态和事件。                               | 创建候选 Runtime、检查、切换并排空旧 Runtime。 |
| Runtime 状态     | 保存期望状态，读取当前快照。                               | 持有真实 Runtime 和进程内状态。                |
| HTTP / WebSocket | 不代理业务 APP 请求。                                      | 根据 APP 路径分发业务请求。                    |
| 权限             | 校验管理操作和 Agent scope。                               | 不承担 Hub 用户权限判断。                      |

管理页面只访问经过认证的 Hub API，不直接调用 App Host 的管理端点。当前 Hub 通过 `LocalHostAdapter` 直接调用同进程的 `AppRuntimeRegistry`，并不通过 HTTP 管理 App Host。

管理者通过 Hub 页面操作控制面。业务用户则直接访问 App Host 提供的 `/<app-slug>`，业务页面、API 和 WebSocket 都不经过 Hub 转发。

### 主要模块

| 模块                   | 位置                                                | 职责                                                |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Hub Client             | `packages/hub/client`                               | APP、Release、Deployment、成员和审计管理界面。      |
| Hub API                | `packages/hub/server/hub/api.ts`                    | 认证、授权、管理 API、部署协调和启动恢复。          |
| Hub Store              | `packages/hub/server/hub/store.ts`                  | APP、Release、Deployment 和权限等核心数据访问。     |
| Management Store       | `packages/hub/server/hub/management-store.ts`       | 管理页面查询、成员、审计、设置和 Release 保留策略。 |
| Release Upload Service | `packages/hub/server/hub/release-upload-service.ts` | 上传任务、解包、校验和 Release 落盘。               |
| Runtime Secret Service | `packages/hub/server/hub/runtime-secret-service.ts` | APP Secret 加密、读取、轮换和状态管理。             |
| Local Host Adapter     | `packages/hub/server/hub/local-host-adapter.ts`     | 把 Hub 的 APP 和 Release 转换成 App Host 运行定义。 |
| App Host               | `packages/app-host`                                 | APP 发现、激活、路由、版本切换、回收和容量管理。    |
| 默认 APP 模板          | `packages/app-template-default`                     | APP 的 Client、Server、配置、插件和构建入口。       |
| APP scripts            | `packages/cli/src/app-scripts`                      | 本地登录、构建、发布、部署和状态查询。              |

## 持久化数据和目录

通过 `pnpm create @nocobase/hub` 创建的 Hub 默认使用以下目录：

```text
my-hub/
├── .env.local
├── .nocobase/
│   ├── hub.sqlite
│   └── runtime-secret.key
└── app-dist/
    ├── .catalog/
    ├── .uploads/
    ├── .runtime/
    │   └── <app-slug>/
    │       ├── database.sqlite
    │       ├── app/
    │       │   ├── private/
    │       │   └── public/
    │       ├── logs/                  # 启用文件日志时创建
    │       └── sessions/              # 仅使用 fs Session store 时创建
    └── <application-id>/
        └── <release-id>/
            ├── nocobase-release.json
            └── dist/
                ├── client/
                ├── database/
                └── server/
                    └── embedded.js
```

其中：

- `.nocobase/hub.sqlite` 保存 Hub 自己的用户、权限和管理数据
- `.nocobase/runtime-secret.key` 是 loopback 开发环境自动生成的 Runtime Secret 加密密钥
- `.uploads` 保存尚未完成的临时上传
- `<application-id>/<release-id>` 保存不可变 Release
- `.runtime/<app-slug>` 保存 APP 的数据库、附件、日志和文件 Session 等可变数据
- `.catalog` 是可选的 App Host 目录发现入口；Hub 管理的 APP 由 `LocalHostAdapter` 直接注册，不依赖这里保存定义

Release 与运行数据分开存放。部署新版本或回滚 Release 只会更换代码产物，不会覆盖 `.runtime/<app-slug>` 中的数据。

## 核心数据模型

### Environment

Environment 表示部署目标。当前 migration 只创建一个固定的 `default` 环境，Deployment 也固定使用它。当前没有多环境创建、修改或删除能力。

### Application

Application 是一个 APP 的管理记录，主要保存：

- `id` 和唯一 `slug`
- 名称和描述
- 管理状态 `active` / `archived`
- 期望运行状态 `running` / `stopped`
- 当前 `activeReleaseId`
- 默认环境 `defaultEnvironmentId`
- 用于并发修改的 `revision`

Application 不包含源码路径，也不持有源码内容。

### Release

Release 是经过校验的不可变构建产物，主要保存：

- APP 和语义化版本号
- 产物 checksum
- `nocobase-release.json` manifest
- 产物存储位置和大小
- 校验状态；标准上传成功后为 `verified`
- 创建人和创建时间

同一个 APP 内版本号唯一。Release 创建完成后不能修改内容，只能进行 pin / unpin，控制它是否可以进入清理候选列表。

标准上传流程只会在校验通过后创建 Release。校验失败会保留为 Release upload 的失败状态，不会生成可部署的 Release。

### Deployment

Deployment 表示一次版本操作，支持：

- `deploy`：部署指定 Release
- `rollback`：回滚到曾经成功部署过的 Release
- `redeploy`：重新部署当前激活 Release

每条记录都会保存目标 Release、上一个 Release、操作类型、状态、操作人、幂等键、Host operation ID 和失败信息。

### DeploymentEvent

DeploymentEvent 按顺序记录一次 Deployment 的阶段和结果。它用于详情页展示过程，也用于故障排查和恢复判断。

### Runtime 和 Health

Hub 数据库包含 Runtime snapshot 和 Health observation 结构。不过当前管理 API 的实时状态主要来自本地 App Host 的进程内 snapshot，持久化表还不是运行状态的主要来源。

### 治理数据

Hub 还保存以下治理对象：

- `RoleAssignment`：全局或 APP 级角色
- `AppScope`：APP 级细粒度 action
- `MemberStatus`：成员启用状态和 revision
- `Invitation`：邀请状态、到期时间和待授予权限
- `AgentDeviceAuthorization`：Coding Agent 的设备授权过程
- `AgentCredential`：Agent access token、refresh token、scope 和 APP 范围
- `RuntimeSecret`：每个 APP 的加密 Secret 版本
- `IdempotencyRecord`：可重试写操作的结果
- `ReleaseRetention`：Release pin 状态
- `AuditLog`：管理操作、结果和调用来源
- `Settings`：Release 保留、审计保留和重要操作确认设置

## APP 的状态模型

APP 的状态不能只用一个字段表示。管理页面需要同时区分以下维度：

| 维度             | 含义                                           | 典型值                                                 |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------ |
| Application 状态 | APP 是否参与正常管理。                         | `active`、`archived`。                                 |
| Release 状态     | 是否已有可部署产物，以及哪个版本处于激活状态。 | 无 Release、已验证、当前激活。                         |
| 期望运行状态     | 管理者希望 APP 运行还是停止。                  | `running`、`stopped`。                                 |
| Runtime 状态     | 当前是否存在真实运行实例。                     | `running`、`idle`、`starting`、`stopping`、`stopped`。 |
| Health           | 当前 Runtime 的健康观察结果。                  | `healthy`、`unknown`。                                 |

`idle` 不等于停止。它表示 APP 的期望状态仍是 `running`，不过当前 Runtime 因为空闲回收或容量回收而不存在。下次访问时，App Host 会按需冷启动。Hub 重启时则会主动恢复期望状态为 `running` 的 APP。

`stopped` 表示期望状态就是停止。此时 App Host 会禁用 APP definition，访问页面、API 或 WebSocket 都不会触发冷启动。

## APP 完整生命周期

```text
创建空 APP
    │
    ▼
本地创建或继续开发源码
    │
    ▼
本地构建 dist
    │
    ▼
上传并验证 Release
    │
    ├──────────────► 仅保存版本，不部署
    │
    ▼
创建 Deployment
    │
    ▼
候选 Runtime → readiness → 切换 → 排空旧 Runtime
    │
    ▼
APP 运行
    │
    ├── 停止 / 启动 / 重启
    ├── 部署新 Release
    ├── 重新部署当前 Release
    └── 回滚历史 Release
```

### 1. 初始化 Hub

可以创建并启动一个独立 Hub：

```bash
pnpm create @nocobase/hub my-hub
cd my-hub
pnpm start
```

第一次访问 Hub 时，需要创建唯一的初始 Owner。公共注册入口保持关闭，其他成员通过邀请加入。

新 Hub 的 APP 列表为空，不会自动创建 `default` APP，也不会创建默认 Release、Deployment 或 Runtime。源码和 APP 都需要由使用者主动创建。

服务端仍保留 `POST /setup/default-app/retry` 显式恢复入口。只有主动调用该接口时，才会创建一个没有 Release 的系统 `default` APP；正常初始化流程不会调用它。

### 2. 创建空 APP

可以在 Hub 的「应用」页面创建 APP，也可以在第一次执行本地发布脚本时创建。创建请求只需要：

- `name`：显示名称
- `slug`：唯一标识，也是默认公开路径 `/<slug>`
- `description`：可选描述

Hub 会在同一个事务中创建 Application、初始 Runtime Secret 和审计记录。此时：

- 没有源码
- 没有 Release
- 没有 Deployment
- 没有 Runtime
- 期望运行状态为 `stopped`

因此，刚创建的 APP 只能进入「开发」引导，还不能管理版本、部署或打开 APP。

### 3. 在本地开发 APP

如果本地还没有源码，先从默认模板创建：

```bash
pnpm create @nocobase/app crm
cd crm
pnpm dev
```

如果已经有源码，直接进入原来的 APP 目录并启动开发：

```bash
cd /path/to/crm
pnpm dev
```

Hub 不会下载或恢复源码。团队需要自行使用 Git 或现有代码托管方式保存源码和协作历史。

### 4. 连接 Hub

APP scripts 使用 Device Authorization 登录 Hub：

```bash
pnpm run hub:login --hub https://hub.example.com/hub
```

终端会显示浏览器授权地址和一次性 code。用户在 Hub 中批准 scope 和 APP 范围后，本地获得 Agent credential。

本地状态分别保存到：

- APP 与 Hub 的关联：项目内 `.nocobase/config.json`
- Agent credential：用户目录 `~/.nocobase/credentials.json`
- 可恢复操作：用户目录 `~/.nocobase/operations`
- 缓存的 Release 包：用户目录 `~/.nocobase/operation-cache`

`.nocobase/config.json` 只保存 Hub URL、Application ID、slug 和模板来源，不保存 access token。

### 5. 创建 Release

只创建 Release、不部署时执行：

```bash
pnpm run release --bump patch
```

也可以指定准确版本：

```bash
pnpm run release --version 1.4.0
```

如果 APP 还没有任何 Release，`--bump patch` 会从 `0.1.0` 开始。后续会根据当前最高语义化版本增加 patch、minor 或 major。

Release 创建流程如下：

```text
运行 APP 的 build script
    ↓
读取 dist/
    ↓
生成 nocobase-release.json
    ↓
计算目录 checksum
    ↓
生成 tar.gz，并计算归档 checksum
    ↓
创建上传任务
    ↓
上传二进制内容
    ↓
Hub 解包、校验并原子移动到 Release 目录
    ↓
生成 verified Release
```

标准 manifest 结构如下：

```json
{
  "schemaVersion": 1,
  "basePath": "/crm",
  "client": {
    "rootDir": "dist/client"
  },
  "server": {
    "entrypoint": "dist/server/embedded.js",
    "healthPath": "/api/healthz"
  }
}
```

Hub 使用三阶段上传：创建 upload、上传 `tar.gz`、完成并校验。上传状态为：

```text
created → uploaded → verifying → completed
                                └→ failed
```

未完成上传还可能进入 `cancelled` 或 `expired`。

### Release 安全校验

本地打包和 Hub 解包会共同校验：

- 归档大小、解包后大小和文件数量上限
- 归档 checksum 和内容 checksum
- manifest 与目标 APP slug 一致
- `dist/server/embedded.js` 存在
- 健康检查路径为 `/api/healthz`
- 不包含符号链接和特殊文件
- 文件路径不能逃出 Release 根目录
- 不包含 `.env` 或任何 `.env.*` 文件

拒绝环境变量文件有两个目的：避免把数据库密码等 Secret 打入 Release，也确保同一个 Release 在不同运行环境中仍然是同一份不可变产物。

同一个 APP、同一个版本和相同 checksum 的重复上传会复用原 Release；相同版本但不同 checksum 会返回冲突。

### 6. 部署 Release

从源码构建、上传并立即部署的常用命令是：

```bash
pnpm run deploy --hub https://hub.example.com/hub --app crm
```

首次成功绑定后，可以直接执行：

```bash
pnpm run deploy
```

不带 Release 选择参数的 `deploy` 会：

1. 关联 Hub 中已有 APP，或按本地项目名称创建 APP
2. 执行本地构建
3. 创建下一个 patch Release
4. 上传并等待 Release 校验完成
5. 创建 `deploy` 类型的 Deployment
6. 轮询 Deployment，直到成功或失败

Release 上传完成不表示已经部署。只有 Deployment 成功后，Application 的 `activeReleaseId` 才会指向该 Release，期望运行状态才会变为 `running`。

### Deployment 前置检查

创建 Deployment 前，Hub 会检查：

- APP 存在且未归档
- 目标 Release 属于该 APP
- 目标 Release 已通过校验
- 同一个 APP 没有其他未完成 Deployment
- `redeploy` 的目标是当前激活 Release
- `rollback` 的目标曾经成功部署过
- 调用者具有对应权限和 Agent scope

同一个 APP、同一个 `default` 环境一次只允许一个非终态 Deployment。Runtime 启停和 Secret 轮换也与 Deployment 共用 APP 级串行锁，避免不同控制操作互相覆盖。

### Deployment 状态机

Hub 持久化的状态链如下：

```text
queued
  ↓
preparing
  ↓
activating
  ↓
checking
  ↓
switching
  ↓
draining
  ↓
succeeded
```

发生错误时进入 `failed`。类型定义中还保留了 `cancelled`，不过当前没有取消 Deployment 的 API。

当前 `LocalHostAdapter.deploy()` 会把候选 Runtime 的创建、切换前后健康检查和旧 Runtime 排空作为一次 Host 操作完成。Hub 随后持久化对应阶段事件和最终控制面状态，所以这些阶段主要用于记录和恢复，不是独立的远程 Host 作业。

### 7. App Host 切换版本

App Host 的实际切换过程如下：

1. 检查当前 Release 是否与 `expectedCurrentReleaseId` 一致
2. 从目标 Release 创建候选 Runtime
3. 对候选 Runtime 执行切换前 readiness 检查
4. 把 APP 的 definition 和 Runtime binding 切换到候选 Runtime
5. 执行切换后 readiness 检查
6. 检查失败时恢复旧 definition 和旧 Runtime
7. 检查成功时等待旧 Runtime 中的请求排空
8. 销毁旧 Runtime

候选 Runtime 通过 readiness 后才接管新请求。这个设计缩短了版本切换窗口，也让健康检查失败时仍能恢复旧 Runtime。

Hub 最后在数据库事务中更新：

- Application 的 `activeReleaseId`
- Application 的 `desiredRuntimeState = running`
- Deployment 的 `succeeded` 状态
- 最终 DeploymentEvent
- APP 的部署 reservation

### 8. 启动、停止和重启

APP 必须先有激活 Release，才能执行 Runtime 控制。

停止 APP 时，Hub 会：

1. 把 App Host definition 设置为 `enabled = false`
2. 等待当前请求排空并销毁 Runtime
3. 保存 `desiredRuntimeState = stopped`
4. 记录审计事件

停止后的 APP 记录、Release 和运行数据都保留。访问 APP 时返回 `503`，错误码为 `APP_STOPPED`，不会自动启动。

启动 APP 时，Hub 会使用当前激活 Release 和 APP Runtime Secret 创建 Runtime，并把期望状态设置为 `running`。

重启 APP 会重新创建当前 Release 的 Runtime。该操作不会创建新 Release，也不会改变 `activeReleaseId`。

### 9. 按需激活和空闲回收

当 APP 的期望状态是 `running`，但 Runtime 因为空闲或容量限制被回收时，Hub 将它展示为 `idle`。之后访问 APP 页面、API 或 WebSocket 时，App Host 会自动创建新的 Runtime。

App Host 当前默认容量策略为：

| 配置              | 默认值     |
| ----------------- | ---------- |
| 最大活跃 APP 数量 | `500`。    |
| 空闲 Runtime TTL  | `5` 分钟。 |
| 回收检查间隔      | `60` 秒。  |

空闲回收只移除进程内 Runtime，不删除 definition、Release 或 `.runtime/<slug>` 数据。

### 10. 部署指定版本和重新部署

部署已经上传的 Release：

```bash
pnpm run deploy --release 1.4.0 --non-interactive
```

重新部署当前激活 Release：

```bash
pnpm run deploy --redeploy --non-interactive
```

重新部署适合在不改变版本号的情况下重建 Runtime，比如 Runtime 异常或 Runtime Secret 更新后重新收敛运行状态。

### 11. 回滚版本

回滚命令会选择历史 Release，并创建一条新的 `rollback` Deployment：

```bash
pnpm run deploy \
  --release 1.3.0 \
  --rollback \
  --non-interactive \
  --yes
```

目标 Release 必须曾经成功部署过。回滚不会修改原来的 Deployment，也不会删除新版本，而是把旧 Release 再走一次完整的候选 Runtime、健康检查、切换和排空流程。

:::warning 注意

回滚只切换代码 Release，不会回滚 APP 数据库、附件、Session 或其他运行数据。

Embedded APP 启动时会自动执行尚未运行的数据库 migration。如果新版本已经修改数据库 schema，切回旧代码不会自动恢复旧 schema。APP 的 migration 必须自行考虑向后兼容和回滚策略。

:::

### 12. 归档和恢复 APP

归档会从 App Host 注销 definition，并把 Application 标记为 `archived`。Release、Deployment、权限、审计和运行数据仍然保留。

恢复会重新把当前激活 Release 配置到 App Host。恢复后的期望运行状态沿用归档前记录：如果期望状态为 `running`，后续访问可以按需启动；如果为 `stopped`，则保持停止。

当前没有永久删除 APP 及其运行数据的管理流程。

## APP 是怎么运行起来的

### 从 Release 到 AppDefinition

部署时，`LocalHostAdapter` 从 Application 和 Release 构造 `AppDefinition`：

```text
id / appName       = <app-slug>
basePath           = /<app-slug>
backend            = in-process
rootDir            = <HUB_RELEASE_ROOT>/<application-id>/<release-id>
dataDir            = <HUB_RELEASE_ROOT>/.runtime/<app-slug>
client.rootDir     = <release-root>/dist/client
server.entrypoint  = dist/server/embedded.js
healthPath         = /api/healthz
releaseId          = <release-id>
desiredVersion     = <release-version>
```

`LocalHostAdapter` 会在交给 App Host 前再次校验服务端入口和 Release checksum。App Host 随后动态导入 `dist/server/embedded.js`。标准 APP 入口导出 `createServer(scope)`，App Host 把 APP 标识、挂载路径、Release 路径、运行数据路径、Runtime Secret 和生命周期 signal 放进 scope。

### APP 内部启动顺序

默认模板的 `createServer(scope)` 会：

1. 解析 embedded scope、路径、路由和配置
2. 解析显式注册的服务端插件
3. 创建 NocoBase `Application`
4. 按顺序注册 Database、Logging、Caching、IdGenerator、Session、Drive 和 Queue Provider
5. 注册插件 Provider、HTTP middleware、健康检查和业务 routes
6. 注册 SPA fallback
7. 启动 Provider 生命周期

Provider 生命周期依次为：

```text
register → boot → start → ready
```

关闭时按相反顺序执行 `shutdown()`，数据库连接、队列、文件句柄和其他资源通过 disposer 释放。

### 健康检查

默认 APP 在 `/api/healthz` 返回 JSON 健康结果。Hub 部署使用的 readiness 策略为：

- 总超时 `2` 秒
- 每 `100` 毫秒重试
- `Content-Type` 必须是 `application/json`
- JSON 必须包含 `{ "ok": true }`

App Host 在切换前和切换后各检查一次。当前检查通过进程内 `Request` 调用完成，不是针对独立 APP 进程的网络探针。

### 请求路由

APP 的公开地址来自 `APP_PUBLIC_ORIGIN` 和 slug：

```text
<APP_PUBLIC_ORIGIN>/<app-slug>/
```

只有 APP 处于 `active`、期望状态为 `running`、已有激活 Release，并且 Hub 配置了 `APP_PUBLIC_ORIGIN` 时，管理页面才提供「打开应用」入口。

App Host 根据 URL 第一段定位 APP：

```text
/<app-slug>/assets/*  → 当前 Release 的 dist/client/assets
/<app-slug>/api/*     → APP Runtime 的 /api/*
/<app-slug>/*         → APP Runtime，最终可由 SPA fallback 返回 index.html
```

请求交给 APP 前，App Host 会剥离 `/<app-slug>`。APP 返回 redirect 时，Host 会补回公开 base path。WebSocket 使用同样的 APP 定位和 Runtime 生命周期。

### 请求排空和资源释放

每个 `AppRuntime` 会统计进行中的 HTTP 请求和 WebSocket 升级处理。销毁时先进入 `draining`，等待这些活动处理结束，默认最长 `10` 秒；随后触发 AbortSignal，通知已经建立的 WebSocket 连接关闭，调用 before-destroy handler，并按相反顺序释放注册资源。

## APP 配置设计

APP 配置需要区分两种运行方式：

| 运行方式     | 配置来源                                                         | 适用场景                  |
| ------------ | ---------------------------------------------------------------- | ------------------------- |
| standalone   | APP 根目录 `.env`、`.env.local`、`process.env` 和显式 override。 | 本地开发或 APP 独立运行。 |
| Hub embedded | App Host 传入的 runtime config；当前只包含 `authSecret`。        | 由 Hub / App Host 托管。  |

当前标准托管模式的实际配置如下：

| 配置领域              | 当前值                                         | 能否在 Hub 中按 APP 配置        |
| --------------------- | ---------------------------------------------- | ------------------------------- |
| Database              | 每个 APP 独立的本地 SQLite                     | 不能                            |
| Database migration    | Runtime 启动时自动执行                         | 不能                            |
| Database seed         | Runtime 启动时不自动执行                       | 不能                            |
| Authentication Secret | Hub 自动生成、加密保存并注入，可通过 Hub 轮换  | 由 Hub 管理，不能输入任意明文值 |
| Better Auth Session   | APP 数据库                                     | 不能                            |
| 服务端 Session        | memory                                         | 不能                            |
| Drive                 | APP 运行目录中的本地 private / public disk     | 不能                            |
| Logging               | pretty 控制台输出                              | 不能                            |
| Caching               | 进程内 memory cache                            | 不能                            |
| Queue                 | 同步队列                                       | 不能                            |
| Notification          | 数据库内的 in-app channel，不启用外部 provider | 不能                            |

标准发布流程会排除并拒绝 `.env*`，当前 Hub 也没有通用的 APP 环境变量管理。`LocalHostAdapter` 目前只注入：

```ts
{
  authSecret: '<APP 独立 Runtime Secret>',
}
```

因此，下面各配置章节需要分开理解：模板能解析这些配置，并不代表当前 Hub 已经可以在管理页面中为每个 APP 配置它们。

### 数据库

默认模板底层支持三种数据库：

- SQLite
- PostgreSQL
- MySQL

可解析的数据库配置包括：

| 配置                          | 用途                              |
| ----------------------------- | --------------------------------- |
| `DB_DIALECT`                  | `sqlite`、`postgres` 或 `mysql`。 |
| `DB_DATABASE`                 | SQLite 文件名或外部数据库名。     |
| `DB_HOST` / `DB_PORT`         | PostgreSQL 或 MySQL 地址。        |
| `DB_USERNAME` / `DB_PASSWORD` | 外部数据库账号。                  |
| `DB_SSL` / `DB_SCHEMA`        | PostgreSQL SSL 和 schema。        |
| `DB_CHARSET`                  | MySQL charset。                   |
| `DB_DEBUG`                    | 数据库调试开关。                  |

#### 当前 Hub 托管 APP 的实际数据库

当前 Hub 没有 APP 级数据库配置 UI/API，也没有把数据库变量作为 runtime config 注入。标准 Hub 托管 APP 因此使用默认 SQLite：

```text
<HUB_RELEASE_ROOT>/.runtime/<app-slug>/database.sqlite
```

每个 APP 的 slug 不同，所以默认数据库相互独立。部署和回滚不会替换这个文件。

:::warning 注意

当前不能通过 Hub 为某个 APP 配置独立 PostgreSQL 或 MySQL，也不能把 `DB_PASSWORD` 放入 Release。

如果需要使用外部数据库，需要先增加安全的 APP 级配置和 Secret 注入能力。当前代码没有实现这条管理链路。

:::

### 数据库 migration 和 seed

APP 的 Database Provider 启动时先处理 migration，再处理 seed。

| 模式         | Migration                                    | Seed                                    |
| ------------ | -------------------------------------------- | --------------------------------------- |
| standalone   | 由 `DB_MIGRATIONS_AUTO_RUN` 控制，默认关闭。 | 由 `DB_SEEDS_AUTO_RUN` 控制，默认关闭。 |
| Hub embedded | 固定自动执行尚未运行的 migration。           | 固定不自动执行。                        |

Hub embedded 自动 migration 确保新 Runtime 在 readiness 前具备所需数据库结构。不过 migration 直接作用于 APP 的持久数据库，因此 APP 代码回滚不会自动撤销 migration。

### Authentication 和 Runtime Secret

默认 APP 使用 Better Auth，启用 email/password，认证 Session 保存在 APP 数据库中，认证路由位于 `/<app-slug>/api/auth/*`。

每个 APP 创建时都会生成一个独立 Runtime Secret。它用于 APP 的 `AUTH_SECRET`，不会复用 Hub 自己的 `AUTH_SECRET`。

Runtime Secret 的存储和使用方式如下：

- 使用 32-byte 随机值
- 使用 AES-256-GCM 加密后写入 `hubRuntimeSecrets`
- AAD 绑定 Application ID、Secret 版本和 key ID
- API 只返回版本和时间等摘要，不返回明文
- 只在部署、启动、重启和恢复 Runtime 时解密并注入
- 支持 pending、active、retired 和 failed 等轮换状态

loopback 开发环境可以在 Hub 数据库旁自动创建权限为 `0600` 的 key 文件，也可以用 `HUB_SECRET_ENCRYPTION_KEY_FILE` 指定其他文件。非 loopback 环境必须显式配置独立的 `HUB_SECRET_ENCRYPTION_KEY`，并且不能与 Hub 的 `AUTH_SECRET` 相同。

### 服务端 Session Provider

这里的 Session Provider 用于通用服务端 Session，和上一节的 Better Auth 认证 Session 是两套存储。默认 Session store 是 memory，模板还支持：

- `fs`：文件 Session，默认位于 APP 运行数据目录
- `redis`：使用 Redis 保存 Session
- `null`：不保存 Session

模板可以解析 Cookie 名称、path、domain、secure、httpOnly、sameSite、有效期、滚动续期和 Redis 连接等配置。不过当前 Hub 没有向单个 APP 注入这些环境变量的入口，所以标准托管模式使用默认值。

### 文件存储

默认 APP 提供两个本地 disk：

```text
.runtime/<app-slug>/app/private
.runtime/<app-slug>/app/public
```

模板也支持通过 `AWS_BUCKET`、`AWS_DEFAULT_REGION`、`AWS_ENDPOINT`、`AWS_ACCESS_KEY_ID` 和 `AWS_SECRET_ACCESS_KEY` 等变量配置 S3。

当前 Hub 没有 APP 级 S3 配置和 Secret 注入，所以标准托管 APP 使用本地文件存储。

### Logging

模板在读取到 `NODE_ENV=production` 时使用按日滚动文件，否则使用 pretty 控制台输出：

```text
.runtime/<app-slug>/logs/<logger>.log
```

默认脱敏字段包括 password、token、access token、refresh token、secret、authorization 和 cookie。日志级别、logger 名称、输出格式和额外脱敏路径都可以由模板配置。

当前 Hub 没有逐 APP 配置入口，也没有向 embedded APP 注入 `NODE_ENV`。因此，标准 Hub 托管 APP 当前使用 pretty 控制台输出，不会默认在 `.runtime/<app-slug>/logs` 下写文件。

### Caching

默认使用进程内 memory cache，可以配置 TTL、最大条目数、检查间隔和是否复制缓存值。当前默认模板没有配置外部 cache provider。

### Queue

默认使用同步队列。模板还支持：

- Redis queue
- Database queue
- Worker queue 列表、并发数、空闲间隔和 timeout
- APP 与插件 job 自动加载

当前 Hub 没有逐 APP Redis 或 Queue 配置入口，因此标准托管模式使用同步队列。

### Notification、Workflow 和 ID

默认模板还可以解析：

- SMTP 和 Resend 邮件通知
- 飞书和钉钉 Webhook 通知
- Workflow 源码、产物 disk 和诊断设置
- Snowflake worker ID 和 epoch
- SPA API client storage 设置

这些都是 APP 模板的配置能力。除 Hub 当前明确注入的 `authSecret` 外，其他配置还不能通过 Hub 按 APP 管理。

## Hub 自身配置

Hub 与被托管 APP 使用两套配置。Hub 自己的主要环境变量如下：

| 配置                                  | 说明                                                     |
| ------------------------------------- | -------------------------------------------------------- |
| `APP_NAME`                            | Hub 应用名，默认 `hub`。                                 |
| `APP_BASE_PATH`                       | Hub 管理页面和 API 的公开路径，默认 `/hub`。             |
| `APP_SERVER_HOST` / `APP_SERVER_PORT` | Hub 管理服务监听地址，默认 `127.0.0.1:13000`。           |
| `APP_HOST_BIND` / `APP_HOST_PORT`     | App Host 监听地址，默认 `127.0.0.1:3000`。               |
| `AUTH_SECRET`                         | Hub Session Secret，至少 32 个字符。                     |
| `AUTH_BASE_URL`                       | Hub 认证公开 URL；非 loopback 或反向代理部署时必须配置。 |
| `HUB_DATABASE_PATH`                   | Hub SQLite 路径，默认 `.nocobase/hub.sqlite`。           |
| `HUB_RELEASE_ROOT`                    | Release、上传和 APP 运行数据根目录，默认 `app-dist`。    |
| `APP_PUBLIC_ORIGIN`                   | App Host 对外 Origin，用于生成「打开应用」URL。          |
| `HUB_SECRET_ENCRYPTION_KEY`           | 非 loopback 环境的 Runtime Secret 加密密钥。             |
| `HUB_SECRET_ENCRYPTION_KEY_FILE`      | 从文件读取 Runtime Secret 加密密钥。                     |
| `HUB_MAX_UPLOAD_BYTES`                | 单个压缩包上传上限。                                     |
| `HUB_MAX_ARTIFACT_BYTES`              | Release 解包后大小上限。                                 |
| `HUB_UPLOAD_TTL_SECONDS`              | 临时上传有效期。                                         |

Hub 管理 API 直接挂载在：

```text
<APP_BASE_PATH>/api
```

默认就是 `/hub/api`，没有 `/v1` 版本段，也没有默认的 `/v2/api/*` legacy proxy。

只有同时配置 `NOCOBASE_API_PROXY_TARGET` 和 `NOCOBASE_API_PROXY_PATH` 时，Hub 才会启用额外的外部 API proxy。这个 proxy 与 APP 运行和部署链路无关。

## 身份、权限和 Agent

### Hub 身份与 APP 身份

Hub 用户只用于管理 APP。每个业务 APP 有自己的用户、角色和 Session，Hub Owner 不会自动成为业务 APP 的管理员，两套身份系统相互独立。

### 内建角色

Hub 使用固定内建角色：

| 角色        | 范围       | 主要能力                                                  |
| ----------- | ---------- | --------------------------------------------------------- |
| `owner`     | 全局       | 所有权限，并负责 Owner 保持规则。                         |
| `admin`     | 全局       | APP、Release、部署、Runtime、成员、权限、审计和设置管理。 |
| `developer` | 全局或 APP | 查看 APP，创建和读取 Release，查看部署、Runtime 和审计。  |
| `deployer`  | 全局或 APP | 部署、回滚、重新部署、控制 Runtime 和查看审计。           |
| `viewer`    | 全局或 APP | 只读 APP、Release、部署、Runtime 和审计。                 |

权限最终按 `resource + action + applicationId` 判断。除了角色，Hub 还支持 APP 级 action scope。成员禁用后不能继续使用 Hub；系统也会阻止禁用或移除最后一个 Owner。

### 邀请

Owner 或 Admin 创建邀请时，可以同时指定全局角色和 APP 权限。接受邀请时，Hub 在事务中创建认证账户、成员状态、角色和 APP 权限，并消费邀请 token，避免只创建了一半的数据。

### Coding Agent 授权

本地 APP scripts 不使用浏览器 Session Cookie，而是通过 Device Authorization 获取 Bearer credential。

Agent 最终权限取以下三者交集：

1. Agent 请求并被批准的 scope
2. 批准用户自身拥有的 Hub capability
3. 被批准的 APP 范围

access token 和 refresh token 在 Hub 数据库中只保存 hash。本地 credential 文件使用受限权限保存，不写入 APP 源码和 Release。

## 审计、并发和故障恢复

### 审计日志

审计记录包括：

- 操作人和 APP
- action、resource 和 resource ID
- `success` / `failure` / `denied` 结果字段
- `web` / `agent` / `system` 来源
- Agent credential 摘要和客户端信息
- failure code、request ID、details 和时间

审计页面支持分页、搜索、筛选、详情和 CSV 导出。CSV 单次最多导出 `10000` 条，并带请求频率限制。默认审计保留时间为 `365` 天。

当前业务操作会写入 `success` 和 `failure`。数据模型和筛选条件已经支持 `denied`，不过拒绝请求的自动审计尚未接入，`recordDeniedMutations` 设置目前不会产生对应日志。

### 幂等

创建 APP、创建上传、创建 Deployment、重启 Runtime 和轮换 Runtime Secret 等操作使用 `Idempotency-Key`。相同身份、端点、资源范围、key 和请求内容重复提交时，Hub 返回原结果；相同 key 对应不同请求时返回冲突。

本地 APP scripts 还会保存 operation journal。构建、上传或部署中断后，可以使用输出中的 `--operation-id` 继续同一个操作，避免重复创建 Release 或 Deployment。

### 乐观锁

APP 信息、归档、恢复、成员状态、权限和 Hub 设置使用 revision / ETag 乐观锁。客户端修改时携带 `If-Match`，如果资源已被其他操作更新，Hub 返回冲突，避免静默覆盖。

### 部署恢复

Hub 重启时会恢复未完成 Deployment：

- `queued` 或 `preparing` 可以重新调度
- 如果目标 Release 已激活，或能从 Host operation ID 证明结果，Hub 会收敛并补齐控制面状态
- Host 操作已经开始但结果无法安全证明时，Deployment 标记为 `HUB_RESTARTED_DURING_DEPLOYMENT`

Hub 还会根据 Application 的当前 Release 和期望状态恢复 App Host definition：

- `running` 的 APP 重新恢复当前 Release
- `stopped` 的 APP 只恢复 disabled definition，不创建 Runtime

### Release 保留和存储清理

Release 可以 pin。当前激活版本、已 pin 版本、非终态 Deployment 的目标和上一个版本、每个 APP 最新保留数量内的版本，以及未达到最小年龄的版本不会进入清理候选。已经结束的历史 Deployment 引用不会单独保护 Release。

当前只实现了 cleanup plan 和可回收空间计算。自动清理固定关闭，也没有真正执行 Release 删除的管理 API。

## 当前实现限制

以下边界是当前代码的实际状态：

- 新 Hub 不自动创建默认 APP
- Hub 不保存、下载或编辑源码
- 只有固定 `default` Environment，没有多环境管理
- APP Runtime 只使用 `in-process` backend，没有进程或容器隔离
- Hub 与本地 App Host 通过同进程对象调用，没有远程 Host 管理协议
- Hub 只能向 APP 注入独立 `authSecret`
- 没有 APP 级环境变量、数据库连接或通用 Secret 管理
- 标准托管 APP 使用独立 SQLite、本地文件存储、memory Session 和同步队列
- PostgreSQL、MySQL、Redis、S3、SMTP 等只是模板可解析的配置，还不能通过 Hub 配置
- Runtime snapshot 和 Health observation 的持久化表还不是实时状态的主要来源
- `recordDeniedMutations` 已进入设置和数据模型，不过拒绝请求的自动审计尚未接入
- Deployment 没有取消 API
- Release 自动清理没有启用
- 版本回滚不回滚数据库和附件
- 归档不等于删除，当前没有永久删除 APP 数据的流程
- APP Host 的 readiness 是进程内检查，不是独立服务网络探针

## 相关链接

- [Quickstart](../quickstart.md) — 创建本地 APP、准备 Hub 和完成首次部署
- [APP 管理脚本](../cli/nb3-app.md) — Release、Deployment、回滚和状态查询命令
- [连接 Hub](../cli/nb3-hub.md) — Device Authorization 和 Agent credential
- [应用平台架构](../app-platform-architecture.md) — App Host、APP Server 和 Client 的目标/通用架构，并非当前 Hub 的同进程部署形态
- [Hub 应用管理 API](./hub-application-management-api.md) — Hub 管理 API 的详细资源和请求约定
