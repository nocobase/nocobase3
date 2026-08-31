---
title: App 管理与部署架构
description: Hub、App Host 与 App 的职责，以及单机、独立进程和 Kubernetes 部署组合
---

# App 管理与部署架构

本文重新整理 Hub、App Host 与 App 的管理和部署模型。目标不是支持三者的任意排列组合，而是在保持统一管理语义的前提下，为不同规模用户提供少数几种明确的推荐部署方法。

设计基于当前代码事实。文中会明确区分当前实现、目标设计和暂不支持的能力。

## 1. 三个逻辑角色

Managed 架构始终只有三个逻辑角色：

```text
User / CLI
    │
    ▼
   Hub
    │ management protocol
    ▼
   Host
    │ runtime/deployment backend
    ▼
   App
```

三者可以位于同一台机器、不同进程或不同 Kubernetes Pod，但职责不随部署位置变化。

### 1.1 Hub

Hub 是面向用户的管理控制面，负责：

- 用户、角色、权限和审计；
- App、Release、Environment 和 Deployment 的期望状态；
- 创建、发布、扩容、回滚和配置管理 API；
- 管理操作的状态和历史；
- 调用 Host 的可信管理接口；
- 展示 Host 上报的实际运行状态。

Hub 不直接加载业务 App，也不直接调用 App Runtime。Managed 操作统一经过 Host。

### 1.2 App Host

App Host，简称 Host，是 Hub 与 App 之间的执行和适配层，负责：

- 向 Hub 提供统一的内部管理 API；
- 将 App Deployment 转换为具体运行方式；
- 获取、校验和准备 App Release；
- 启动、停止、reload、扩缩容和观察 App；
- 根据平台调用本地 Runtime Backend 或 Kubernetes API；
- 聚合并上报 App 的实际状态。

Host 不负责 Hub 用户 RBAC，不保存 App 业务数据，也不应成为 App、Release、Deployment 的权威数据库。

### 1.3 App

App 是业务应用：

- 可以完全脱离 Hub 和 Host 独立运行；
- 自己拥有业务数据库和运行配置消费逻辑；
- 可以被 Host 以 in-process、Worker、子进程或独立服务方式管理；
- 不需要继承 Host 基类；
- 通过统一 Runtime 入口、HTTP endpoint 和可选管理能力接入 Host。

因此“Standalone App”和“Kubernetes App”不是两种 App。Standalone 表示 App 拥有独立进程；Kubernetes 只是这个进程的部署平台。

## 2. 两个必须分开的部署维度

整体组合由两个独立维度决定。

### 2.1 Hub 与 Host 如何部署

| Hub–Host 关系            | 通信                        | 典型用途               |
| ------------------------ | --------------------------- | ---------------------- |
| Hub spawn Host 子进程    | Node IPC 或 loopback HTTP   | 默认单机模式           |
| Hub 与 Host 同机独立进程 | Unix socket / localhost RPC | 进程隔离、系统服务部署 |
| Hub 与 Host 分离部署     | authenticated internal RPC  | Kubernetes 或远程环境  |

通信方式可以变化，但 Hub 调用的 Host Management Contract 应保持一致。

### 2.2 Host 如何运行 App

| Backend      | App 位置                  | Host 是否拥有进程生命周期         | 典型用途                         |
| ------------ | ------------------------- | --------------------------------- | -------------------------------- |
| `in-process` | Host 进程内               | 是                                | 默认单机、密度优先               |
| `worker`     | Host 的 Worker Thread     | 是                                | 需要一定故障隔离但仍共享进程资源 |
| `process`    | Host 启动的子进程         | 是                                | 普通服务器上的进程隔离           |
| `standalone` | 独立服务或 Kubernetes Pod | 通过 Deployment Driver 管理或绑定 | 独立扩缩容、资源和故障边界       |

一个逻辑 Host可以同时支持多种 Backend：

```text
Host
├── App A → in-process
├── App B → worker
├── App C → process
└── App D → standalone Kubernetes Deployment
```

但不同 Backend 的生命周期所有权必须明确。Host 可以创建的独立 Deployment 由 Host 管理；用户已有的 Standalone App 只建立 Binding，Host 不自动取得其生命周期所有权。

## 3. Host 的控制职责与运行职责

单机模式中，两种职责可以存在于同一个 Host 进程：

```text
Host process
├── Management API
├── Deployment/Runtime Backend
└── in-process App Runtimes
```

Kubernetes 中需要区分两个职责，但不需要引入第四个产品角色。

### 3.1 Host Control

Host Control 是 Host 的管理面：

- 接收 Hub 的 Deployment 请求；
- 创建或更新 Kubernetes Deployment、Service、Job 和配置引用；
- 创建 Host Runtime Deployment；
- 观察 Kubernetes 和 App 状态；
- 向 Hub 返回统一状态。

### 3.2 Host Runtime

Host Runtime 是实际承载 in-process/Worker App 的运行面：

- 运行在一个或多个 Pod；
- 每个 Pod 内有一个 Host Runtime 进程；
- 从不可变 Runtime Manifest 加载相同的 App 集合；
- 不保存权威管理状态；
- 不管理其他独立 App Deployment。

`Host Control` 和 `Host Runtime` 可以由同一个 `app-host` package 提供不同启动模式，例如：

```text
app-host control
app-host runtime
```

这只是 Host 的内部部署拆分，产品模型仍然是 Hub、Host、App 三者。

## 4. 推荐部署组合

### 4.1 组合 A：App 独立运行

适合开发者、单 App 或已有部署平台的用户。

```text
App process
├── standalone HTTP server
├── config.yml / custom ConfigProvider
└── business database
```

特点：

- 无 Hub、无 Host；
- App 完全自治；
- 可以运行在物理机、虚拟机、容器或 Kubernetes；
- 不具备 Hub 的统一用户、发布和审计能力。

如果以后需要纳入 Hub，可以建立 Standalone Binding，或者迁移到 Host-managed standalone Backend。接入 Hub 不改变 App 自身的运行形态。

### 4.2 组合 B：默认单机 Managed

适合个人、小团队和单机多 App，是产品默认 managed 方案。

```text
Hub process
├── Hub DB: SQLite
└── spawn Host child process
    ├── App A in-process
    ├── App B in-process
    └── App C in-process
```

推荐约束：

- 一个 Hub；
- 一个 Host；
- App 默认使用 in-process Backend；
- 每个 App 一个 Runtime；
- Hub 与 Host共享本地 Release/config 文件；
- 不承诺 HA、自动故障迁移或多副本。

这里 App 管理记录和期望状态存储在 Hub DB。Host 重启后由 Hub 重新下发完整运行快照。

### 4.3 组合 C：单机进程隔离

适合不使用 Kubernetes，但部分 App 需要崩溃或资源隔离的用户。

```text
Hub
└── Host
    ├── App A in-process
    ├── App B Worker
    └── App C child process
```

这个组合沿用单机管理模型，只改变 App Backend。建议在默认单机闭环稳定后再实现 Worker 和 Process Backend，不把它作为首期要求。

### 4.4 组合 D：Kubernetes 标准生产部署

适合需要独立扩缩容、滚动发布、资源限制和故障恢复的生产用户，是 Kubernetes 的默认推荐。

```text
Kubernetes
├── Hub Deployment
├── Host Control Deployment
├── App A Deployment
│   ├── Pod A1: Generic Runner + App A artifact
│   └── Pod A2: Generic Runner + App A artifact
├── App B Deployment
│   └── Pod B1: Generic Runner + App B artifact
└── App C Deployment
    └── Pod C1: custom App image
```

管理链路：

```text
User / CLI
    → Hub API
    → internal RPC
    → Host Control
    → Kubernetes API
    → App Deployment
```

业务链路直接进入 App：

```text
Ingress / Gateway → App Service → App Pods
```

职责边界：

- Hub 保存产品期望状态和授权；
- Host Control 将 Deployment 转为 Kubernetes 资源；
- Kubernetes 负责 Pod 调度、replicas、健康恢复和 rollout；
- App 以 standalone 方式运行；
- Host 不自行实现 Pod 调度和故障迁移。

### 4.5 组合 E：Kubernetes 密度优先部署

适合大量低流量 App，一 App 一 Pod 的内存和进程开销已经成为明确成本问题。

```text
Kubernetes
├── Hub Deployment
├── Host Control Deployment
└── Host Runtime Deployment (replicas: 2)
    ├── Pod 1
    │   └── Host Runtime
    │       ├── App A in-process
    │       ├── App B in-process
    │       └── App C in-process
    └── Pod 2
        └── Host Runtime
            ├── App A in-process
            ├── App B in-process
            └── App C in-process
```

这个共同部署单元可以称为 `Host Runtime Deployment`。如果产品需要把它暴露为领域资源，再命名为 `AppHostGroup`；首期不必急于增加该模型。

其运行语义是：

- Host Runtime Deployment 的 replicas 为 2；
- App A、B、C 都得到两个 Runtime；
- 同组 App 使用相同副本数；
- 同组 App 共同滚动发布；
- 同组 App 共享 Pod 资源和故障边界；
- 任一 App 的 Release 或启动配置变化可能触发整组 rollout。

只有能够接受这些约束的 App 才能放入同一个 Host Runtime Deployment。

### 4.6 组合 F：Kubernetes 混合部署

适合同时存在大量小 App 和少量高负载/特殊 App 的中大型用户。

```text
Hub Deployment
└── Host Control Deployment
    ├── Host Runtime Deployment
    │   ├── Pod 1 → App A + App B + App C
    │   └── Pod 2 → App A + App B + App C
    ├── App D Deployment (replicas: 5)
    │   └── standalone Runner + artifact
    └── App E Deployment (replicas: 2)
        └── custom image
```

同一个 Host Control 可以同时管理：

- Host Runtime Deployment 中的 in-process/Worker App；
- 独立 Kubernetes Deployment 中的 standalone App；
- 已有 Standalone Service 的只读或有限管理 Binding。

推荐分组原则：

- 低流量、相同副本需求、相同维护窗口的 App 进入 Host Runtime Deployment；
- 高流量、独立 SLA、独立发布节奏的 App 使用 standalone Deployment；
- 特殊系统依赖使用 custom image；
- 已有平台的 App 保持 standalone，只建立明确 Binding。

## 5. 不同规模用户的推荐

| 用户规模/需求        | 推荐组合               | 原因                                      |
| -------------------- | ---------------------- | ----------------------------------------- |
| 单个 App、开发环境   | A：App 独立运行        | 最少概念和依赖                            |
| 单机运行多个 App     | B：默认单机 Managed    | 一个 Host 聚合 App，Hub 提供统一管理      |
| 单机但需要部分隔离   | C：单机进程隔离        | 不引入 Kubernetes，也能隔离故障           |
| 标准 Kubernetes 生产 | D：Kubernetes 标准     | App 独立扩缩容和发布，充分使用 Kubernetes |
| 大量低流量 App       | E：Kubernetes 密度优先 | 用共享 Host Runtime 降低 Pod/进程开销     |
| 大型混合负载         | F：Kubernetes 混合     | 按 App 特征选择 Backend                   |

推荐默认路径：

```text
没有 Kubernetes
├── 单 App → 独立运行
└── 多 App → Hub + local Host + in-process Apps

使用 Kubernetes
├── 默认 → Host Control + standalone App Deployments
└── 确认存在密度成本 → 增加 Host Runtime Deployment
```

不要因为未来可能需要密度优化，就让所有部署在 Kubernetes 的 App 默认进入共享 Host Runtime。

## 6. 多副本的含义

必须分别描述以下副本，不能统一称为“多 Host”：

| 副本类型                | 含义                             | 谁负责                                       |
| ----------------------- | -------------------------------- | -------------------------------------------- |
| Hub replicas            | Hub API/Controller 高可用        | Kubernetes + shared Hub DB                   |
| Host Control replicas   | Host 管理面高可用                | Kubernetes + leader/reentrant reconciliation |
| Host Runtime replicas   | 同一组 in-process App 的共同副本 | Kubernetes Deployment                        |
| standalone App replicas | 某个 App 的独立副本              | Kubernetes Deployment                        |

例如：

```yaml
hub:
  replicas: 2

hostControl:
  replicas: 1

hostRuntime:
  replicas: 2
  apps: [app-a, app-b]

apps:
  app-c:
    backend: standalone
    replicas: 5
```

实际结果：

- 两个 Hub Pod；
- 一个 Host Control Pod；
- 两个 Host Runtime Pod，其中各运行 App A 和 App B；
- 五个独立 App C Pod。

Host Runtime replicas 不等于所有 App replicas。只有属于该 Runtime Manifest 的 App 才继承它的副本数。

## 7. Environment 与多环境

Environment 是 Deployment、配置、Secret、路由、平台凭据和权限的隔离边界。

```text
Environment: local
└── local Host

Environment: staging
├── cluster-a
├── namespace staging
└── Host Control

Environment: production
├── cluster-b
├── namespace production
└── Host Control
```

一个 Hub 可以管理多个 Environment。每个 Environment 独立配置：

- Host endpoint 或部署方式；
- Kubernetes cluster/namespace/service identity；
- Release registry/artifact store；
- 配置和 Secret backend；
- 域名、Gateway 和证书策略；
- 发布权限和审批策略。

Host Control 应限定在一个 Environment 的信任和凭据范围内。一个 Host Control 不应使用同一身份跨多个生产 Environment 操作资源。

## 8. 数据存储边界

### 8.1 Hub DB

Managed 模式的权威管理数据存放在 Hub DB：

- App；
- Release；
- Environment；
- Deployment；
- Operation/Audit；
- Config Contract；
- Hub-managed config；
- Host 和平台资源引用；
- 最后一次观测状态。

默认单机使用 SQLite，公共配置只需要一个 connection，并复用 `@nocobase/app-database` 的连接、migration 和 repository 能力。Hub 多副本必须使用共享 PostgreSQL/MySQL，不能让多个 Hub Pod 各自使用 SQLite。

### 8.2 Host 状态

Host 只保存：

- 当前 Deployment/Runtime Manifest 快照；
- Runtime Registry；
- Release/asset cache；
- 日志；
- 可选的可恢复本地缓存。

Host 不需要公共的权威数据库配置。可恢复缓存可以是文件或 SQLite，但 Hub 不依赖它。

### 8.3 App 数据库

App 的业务数据库始终属于 App，与 Hub DB 和 Host 缓存分离。

## 9. Release 与镜像

Kubernetes Pod 必须使用容器镜像，但 App Release 不必等于 App 镜像。

默认交付方式：

```text
Generic Runner/Host image
        +
immutable App artifact
        +
revisioned config reference
```

App artifact 至少包含：

- server entry；
- client assets；
- release manifest；
- checksum/signature；
- Config Contract；
- Runtime 版本和平台约束。

纯 JavaScript 或兼容依赖使用 Generic Runner。需要特殊系统库、native addon、Node 版本或外部程序的 App 使用 custom image。

生产 Pod 不应在启动时执行无锁定的依赖安装。initContainer/Runner 下载 artifact 时必须校验 checksum，失败则不能进入 Ready。

## 10. 配置管理

### 10.1 Config Contract

Config Contract 随 Release 发布，包括 JSON Schema、UI hints、敏感字段、默认值和生效策略。Hub 可以在 App 未运行或启动失败时读取 Contract 并生成配置界面。

Contract 的权威来源是 Release，不依赖运行中的 App。Hub 保存或缓存 Contract，Host 在部署时校验 Contract 与 Release checksum。

### 10.2 配置值

配置值有两种模式：

1. **Hub-managed**：Hub 保存配置或 Secret 引用，Host 在部署时注入文件、环境变量、ConfigMap/Secret 或 Provider bootstrap；
2. **Externally managed**：App 通过自定义 Config Provider 直接读取 Consul、Nacos、Vault、Git 等外部系统。

配置读写不能依赖业务 App Runtime 成功启动，否则错误配置会造成无法启动、也无法修复的死锁。

Hub 和 Host 无法预先理解用户任意实现的第三方 Provider。若 Hub 需要编辑某个第三方配置中心，必须安装明确的 control-plane adapter；否则 Hub 只显示来源、Contract、状态和外部管理入口。

Runtime `ConfigProvider` 可以继续保持 read/reload 语义。可选 `WritableConfigProvider` 不应成为 Hub 管理配置的通用前提，也不应要求通过运行中的 App 调用。

## 11. 管理协议与 API

### 11.1 Hub 对外 API

Hub 对 UI、CLI 和 CI/CD 提供：

- App/Release API；
- Environment API；
- Deployment API；
- deploy/scale/restart/rollback/remove 操作；
- config schema/read/write；
- operation/status/audit。

普通 CLI 调用 Hub，使用与 UI 相同的用户和权限模型。

### 11.2 Hub–Host 内部协议

Host 对 Hub 提供统一能力：

```ts
interface HostManagementService {
  applyDeployment(spec: DeploymentSpec): Promise<OperationRef>;
  removeDeployment(id: string): Promise<OperationRef>;
  getDeploymentStatus(id: string): Promise<DeploymentStatus>;
  getCapabilities(): Promise<HostCapabilities>;
}
```

单机使用 IPC，分离部署使用认证的内部 RPC。两种 transport 共享 DTO、幂等键、generation 和 Operation 语义。

### 11.3 Host–App 接口

- in-process：直接调用 Runtime Handle；
- Worker：message channel；
- Process：IPC/loopback HTTP；
- standalone：HTTP/internal RPC、Kubernetes API 和健康检查。

业务流量不要求经过 Host。Host 管理 App，不等于 Host 必须代理 App 数据面。

## 12. 安全与权限

- Hub 认证用户和 service account，执行产品 RBAC；
- Host 只认证可信 Hub/control-plane identity；
- Host 不解析 Hub 的用户角色；
- Hub 将 actor/request ID 传给 Host 用于审计；
- 单机 IPC 使用父子进程 capability；
- Kubernetes/远程 RPC 使用 mTLS、短期 token 或 workload identity；
- Host 的 Kubernetes identity 限定到目标 Environment/Namespace；
- Secret 默认 write-only，不进入日志和普通状态响应；
- CLI 默认不直连 Host；recovery 接口使用独立凭据和审计策略。

## 13. Kubernetes 状态与自举边界

Hub 保存产品期望状态，Host Control 创建 Kubernetes 资源，Kubernetes 保存并调和基础设施状态：

```text
Hub Deployment generation
        │ Host Control reconcile
        ▼
Kubernetes resource generation
        │ Kubernetes controllers
        ▼
Pod observed status
```

Host Control 使用 label/annotation 标记资源所有权和 generation。删除时必须校验 ownership UID，不能只按名称删除资源。

Hub、Hub DB、Host Control 和初始 Kubernetes identity 由 Helm、GitOps 或平台管理员安装升级，不由 Hub 把自己当成普通业务 App 管理。Hub/Host Control 故障时，已有 App Pod 继续运行；控制面恢复后重新观测状态。

首期直接管理标准 Deployment、Service、ConfigMap/Secret 引用和 Job，不必先实现 CRD/Operator。只有需要 Kubernetes 原生声明式入口或独立 reconciliation 时才引入 Operator。

## 14. 当前代码事实

### 14.1 当前 App Host

`packages/app-host` 当前：

- 使用 Node `node:http`，不是 Hono；
- 通过 `DirectoryAppCatalog` 扫描 `APP_DIST_DIR` 一级目录；
- 发现含 `dist/server/embedded.js` 的 App；
- `AppRuntimeRegistry` 的 Definition 和 Runtime 都是内存状态；
- 已提供 rescan、activate、deploy、reload、evict 等 HTTP API；
- deploy 主要是 Runtime 重建和版本元数据更新，不是完整制品发布；
- 只实现 `InProcessAppBackend`；
- `AppHostSupervisor` 已存在，但尚未接入 Hub。

### 14.2 当前 Hub

Hub Server 使用 Hono，但 `/api/apps` 当前只返回空数组。Hub 尚未实现 App、Release、Environment、Deployment repository，也没有连接 `AppHostSupervisor`。

### 14.3 当前 App Config

App 默认从显式 `configPath`、`APP_CONFIG_FILE` 或 App 根目录的 `config.yml|yaml|json` 加载配置。当前 `ConfigProvider` 是只读接口，`AppConfig` 支持加载、合并、校验、reload 和 subscribe。

## 15. 推荐实现顺序

### 阶段一：默认单机闭环

1. Hub 建立 App、Release、Environment、Deployment 和 Operation repository；
2. Hub DB 默认 SQLite，并使用 `@nocobase/app-database`；
3. Hub 接入 `AppHostSupervisor`；
4. 定义 Host Management DTO 和进程内 service；
5. 实现 IPC/loopback transport；
6. Host 根据 Hub 运行快照构建 Runtime Registry；
7. 目录扫描降级为显式 import/development 兼容入口。

### 阶段二：Release 与配置闭环

1. 不可变 Release artifact、manifest 和 checksum；
2. 构建期生成 Config Contract；
3. Hub-managed config 和配置快照注入；
4. generation、Operation、发布、回滚和状态上报；
5. 保留 App standalone 的 file/custom Provider 能力。

### 阶段三：Kubernetes standalone Backend

1. 将 Host 拆成可独立部署的 Host Control；
2. 实现 Kubernetes Deployment Driver；
3. Generic Runner + artifact store；
4. 管理 Deployment、Service、Job 和配置引用；
5. 支持 Environment 到 Cluster/Namespace 的映射；
6. Kubernetes 负责 replicas、调度、健康恢复和 rollout。

### 阶段四：按需求增加 Backend

1. 单机 Worker/Process Backend；
2. Kubernetes Host Runtime Deployment；
3. 多 App 密度分组；
4. Hub 和 Host Control HA；
5. 第三方部署 Driver 和配置 adapter。

不建议在没有明确需求时优先实现非 Kubernetes 的远程多 Host 调度、租约和故障迁移。

## 16. 决策摘要

1. Managed 架构保持 Hub、Host、App 三个逻辑角色；
2. Hub 始终通过 Host 管理 App，不直接操作 App Runtime；
3. App 可以脱离 Hub/Host 独立运行；
4. Host 可以同时支持 in-process、Worker、Process 和 Standalone Backend；
5. 默认单机为 Hub spawn Host，Host in-process 运行多个 App；
6. Kubernetes 默认由 Host Control 管理独立 Standalone App Deployment；
7. Kubernetes 密度优化时使用 Host Runtime Deployment 承载同一组 in-process App；
8. Host Runtime replicas 和 Standalone App replicas 是不同概念；
9. Kubernetes 的调度、Pod 恢复和 rollout 不在 Host 中重复实现；
10. Hub DB 是 managed 状态权威来源，默认 SQLite，多 Hub 使用共享数据库；
11. Host 只保存 Runtime 状态和可恢复缓存；
12. Config Contract 属于 Release，配置读写不依赖运行中的 App；
13. 第三方配置中心需要明确 adapter，Host 不做未知 Provider 的通用写桥；
14. 先实现单机闭环和 Kubernetes standalone，再根据真实密度需求实现共享 Host Runtime。
