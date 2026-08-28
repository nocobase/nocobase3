---
title: 应用平台架构
description: Hub、App Host 与 App 的职责、运行与激活方式，以及 Server 和 Client 的组装与路由
---

# 应用平台架构

## Hub、App Host 与 App

### 核心概念

- **Hub**：多应用管理中心。Hub 本身也是一个特殊的 App，负责管理
  `app-host` 及其托管的多个业务 App。
- **App Host**：App 运行宿主，负责发现、注册、激活和运行多个 App，
  并分发 HTTP 与 WebSocket 请求。
- **App**：具体的业务应用，可以独立运行，也可以构建后由 `app-host`
  托管。

### 默认子进程模式

> 目标架构：`AppHostSupervisor` 已实现，但尚未接入 Hub。

Hub 作为主进程运行，并通过 `AppHostSupervisor` 启动一个 `app-host`
子进程。`app-host` 从 App 目录发现业务 App，并按需激活对应的 runtime。

```text
┌────────────────────────────────────────────────────────────┐
│ Hub process                                                │
│                                                            │
│  ┌────────────────────┐       ┌─────────────────────────┐  │
│  │ Hub                │ ────► │ AppHostSupervisor       │  │
│  └────────────────────┘       └────────────┬────────────┘  │
└────────────────────────────────────────────│───────────────┘
                                             │ spawn / manage
                                             ▼
┌────────────────────────────────────────────────────────────┐
│ app-host child process                                     │
│                                                            │
│  discover ──► register ──► activate                        │
│                                                            │
│  ┌────────────┐       ┌────────────┐       ┌────────────┐  │
│  │ app-a      │       │ app-b      │       │ app-c      │  │
│  │ runtime    │       │ runtime    │       │ runtime    │  │
│  └────────────┘       └────────────┘       └────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 集群模式

Hub 与 App Host 独立部署：

- Hub 作为独立进程运行；
- App Host 以集群或多实例方式运行；
- NGINX/Caddy 优先将 `/<app>/assets/*` 代理到对应 App 的静态资源上游；
- NGINX/Caddy 将其他 `/<app>/*` 请求分发给 App Host，将
  `/hub/*` 分发给 Hub；
- App Host 实例需要访问相同版本的 Server 构建产物，静态资源
  上游需要访问同一发布版本的 Client 构建产物。

```text
┌───────────────────┐
│ Browser           │
└─────────┬─────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│ NGINX / Caddy                                                        │
│                                                                      │
│  /<app>/assets/*       /<app>/*                  /hub/*              │
└─────────┬─────────────────────────┬────────────────────────┬─────────┘
          │                         │                        │
          ▼                         ▼                        ▼
┌────────────────────┐  ┌────────────────────────┐  ┌──────────────────┐
│ App assets         │  │ app-host cluster       │  │ Hub process      │
│ / static origin    │  │                        │  │                  │
│                    │  │ instance 1             │  │ Hub Manager      │
│ app-a/assets       │  │ instance 2             │  └──────────────────┘
│ app-b/assets       │  │ instance 3             │
└────────────────────┘  │ assets fallback        │
                        └────────────────────────┘
```

App Host 保留 `/<app>/assets/*` 的静态资源处理能力，作为默认
子进程模式、本地开发或未配置网关静态资源规则时的兜底。

### App 的发现与激活

`app-host` 启动时发现 App artifact 并注册 `AppDefinition`。请求第一次到达
或管理端显式激活时，`AppRuntimeRegistry` 才通过
`AppActivationBackend` 创建 `ActiveAppHandle`。

```text
App artifact
    → AppDefinition
    → AppActivationBackend
    → ActiveAppHandle
```

### App 运行方式（AppActivationBackend）

这里的 Backend 不是业务后端或 Server API，而是 App 的**运行方式适配器**。
`AppActivationBackend` 决定 App 在哪里、以什么方式运行，负责在对应的
运行环境中激活 App，并返回统一的 `ActiveAppHandle`。

对 `app-host` 来说，无论 App 实际运行在当前进程、Worker、独立进程还是
外部服务中，后续都通过同一种 Handle 分发 HTTP 与 WebSocket 请求、读取
状态并管理生命周期。

当前实现：

- `InProcessAppBackend`：App 与 `app-host` 运行在同一个 Node.js 进程中，
  `app-host` 直接调用 App runtime。

未来实现：

- `WorkerAppBackend`：App 运行在 Worker Thread 中，通过消息桥接与
  `app-host` 通信。
- `ProcessAppBackend`：App 运行在独立子进程中，通过 IPC 或本地 HTTP
  与 `app-host` 通信。
- `ExternalServiceAppBackend`：App 运行在外部服务中，`app-host` 只负责
  代理请求，不负责创建或管理该服务进程。

### App 服务入口（createServer）

无论 App 由哪种 `AppActivationBackend` 激活，都不需要继承
`app-host` 的基类。构建产物只需在 `dist/server/embedded.js`
导出统一的 `createServer(appScope)` 工厂函数：

```ts
import type { AppFactory } from '@nocobase/app-host/app-types';

export const createServer: AppFactory = (appScope) => {
  const websocket = createWebSocketHandler(appScope);

  return {
    fetch(request) {
      return new Response(`Hello from ${appScope.id}`);
    },
    websocket,
  };
};
```

`fetch` 是必需的 HTTP 入口，`websocket` 是可选的 WebSocket 入口。
`createServer` 可以是同步函数，也可以是异步函数。

`appScope` 由 `app-host` 为当前 App 实例提供，包含 App 标识、
挂载路径、配置、`AbortSignal` 和生命周期注册接口。App 可以通过
`appScope.registerDisposer(...)` 注册数据库连接、定时器等资源的释放逻辑。

这个小型适配层将 App 的内部实现与 `app-host` 解耦。App 内部可以
使用 Hono 或其他 HTTP 实现，`app-host` 只依赖统一的
`{ fetch, websocket? }` 接口。

### Server 与 Client 路由

```text
Browser request
      │
      ▼
┌────────────────────────────────────────────────────────────────────┐
│ Application.fetch(request) -> Router Service                       │
│                                                                    │
│  /api/*          -> API routes       -> JSON response              │
│  /<custom-route> -> Server route     -> Response                   │
│  /*              -> SPA fallback     -> index.html                 │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ 仅 SPA fallback
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│ createAppClient() -> Refine App (React App)                        │
│                                                                    │
│ BrowserRouter / AppRouter                                          │
│  /<custom-page> -> Client route -> Page                            │
└────────────────────────────────────────────────────────────────────┘
```

Server Routes 按顺序匹配，`/*` 作为最后的 SPA fallback。首次直接访问
`/<custom-page>` 时，Server 先返回 `index.html` 并注入
`window.nb_config`；Client 启动后，再由 Refine App 中的前端路由渲染页面。

### Server 组装（createApplication）

```text
appScope
    │
    ▼
createServer(appScope)                 App Host 适配
    │
    ▼
loadAppConfig() → AppServerConfig      加载并规范化配置
    │
    ▼
createApplication(runtime, options)    NocoBase Application 组装
    │
    ├── AppRuntime
    ├── ServiceContainer
    │   └── Router（Hono）
    ├── Core + Plugin ServiceProviders
    └── Routes + WebSocket + SPA
    │
    ▼
Application
    │
    ├── appName
    ├── publicBasePath
    ├── config → AppRuntime.config
    ├── paths → AppRuntime.paths
    ├── runtime
    ├── serviceContainer
    ├── fetch(request) ──────→ Router（Hono）
    └── websocket(request)?
    │
    ▼
AppServer Host Port（fetch + websocket）
```

`Application` 才表示完整的 NocoBase 服务端 App。Hono 只是通过
`routerToken` 注册到 `ServiceContainer` 的 HTTP Router Service，不再作为 App
本身。`AppRuntime` 只保存已经解析好的配置与路径，不创建或持有 Database、Migrator、
Seeder 等服务。Services 提供可复用能力，Plugin
Provider 负责注册和管理服务端扩展的生命周期，Routes 将请求连接到这些能力。

### Client 组装（createAppClient）

```text
window.nb_config
    │
    ▼
loadAppClientConfig() → AppClientConfig                 加载并规范化配置
    │
    ▼
createAppClient({ config })            Client App 组装
    │
    ├── AppClient / API Client
    ├── bootstrap + Refine config
    └── Providers + Routes
    │
    ▼
Refine App（React App）
```

最终的 React 结构大致如下：

```tsx
<BrowserRouter basename={config.app.basePath}>
  <ReactProviderTree providers={runtime.providers}>
    <Refine {...runtime.refine}>
      <AppRouter routes={runtime.routes} />
    </Refine>
  </ReactProviderTree>
</BrowserRouter>
```

## Server 的核心

Server 的核心就是 Services，Config 为 Service 的配置，Database，Router、Logger、Cache 等都是具体的 Service。

```bash
Application
  ├── AppRuntime
  ├── ServiceContainer
  │   ├── Router（Hono）
  │   ├── Database
  │   ├── Logger
  │   ├── Cache
  │   ├── Queue
  │   ├── Realtime
  │   └── Other Services
  ├── ServiceProvider lifecycle
  ├── fetch → Router
  └── websocket
```

### Service Provider

Service Provider 的基础设施由独立的 `@nocobase/service-provider` 包提供，包含
`ServiceContainer`、`ServiceToken`、`ServiceProvider` 和
`ServiceProviderRegistry`。该包不依赖 `AppRuntime` 或具体 Server 框架；
`ServiceProviderContext` 的 `runtime` 类型由使用方传入。

最完整的生命周期

```bash
ServiceProvider
  ├── register
  ├── boot
  ├── start
  ├── ready
  └── shutdown
```

各阶段的运行边界：

```text
createApplication（同步组装）
  ├── register：注册全部服务
  ├── RouterProvider：注册 Hono Router Service
  ├── 注册 Core 和 Plugin Providers
  └── 注册 Routes、WebSocket 和 SPA

Application.start（异步启动）
  ├── boot：全部 Provider 注册和应用组装完成
  ├── start：启动应用服务
  └── ready：应用内部服务已可用

Application.shutdown（逆序释放）
  └── shutdown：停止并释放已经进入生命周期的 Provider
```

Provider 和 Routes 扩展使用统一的运行时来源：

```text
ServiceProviderContext
  ├── runtime
  └── serviceContainer

AppPluginRoutesContext
  ├── appName
  ├── publicBasePath
  ├── config → runtime.config
  ├── paths → runtime.paths
  ├── router
  ├── runtime
  └── serviceContainer
```

Application 通过只读 getter 暴露 `config` 和 `paths`，但两者仍然委托给
`AppRuntime`，不创建第二份状态。Provider 通过 `context.runtime.config`、
`context.runtime.paths` 读取运行时信息，
通过 `context.serviceContainer` 注册和解析服务。Routes 不再单独接收 `config` 和
`paths`，避免同一份运行时状态出现多个入口。`Application` 通过 getter 统一提供规范化的
`appName` 和 `publicBasePath`；Core Routes 和 Plugin Routes 直接接收同一个真实的
`Application`，但插件在类型层面只看到 `AppPluginRoutesContext` 定义的窄接口。

`Application.addProvider` 接收 Provider class，并在内部注入同一个
`ServiceProviderContext`。应用组合根只声明启用了哪些 Provider，以及真正属于 Provider
实例的额外参数：

```ts
app.addProvider(DriveProvider);
app.addProvider(IdGeneratorProvider);
app.addProvider(plugin.Provider);
```

应用配置不通过构造参数从组合根转发。Database、Caching、ID Generator、Drive、Logging、
Queue、Session 等 Provider 直接从 `context.runtime.config` 读取自己拥有的配置；例如
`CachingProvider` 读取 `runtime.config.caching`，`IdGeneratorProvider` 读取
`runtime.config.snowflake`。底层
`ServiceProviderRegistry` 仍接收已经实例化的 Provider，负责
运行生命周期；Provider 的实例化属于 `Application`。

数据库由 `DatabaseProvider` 完整拥有：`register` 根据
`runtime.config.database` 注册惰性的 `databaseManagerToken`，`boot` 准备数据库存储并按配置
依次执行自动 Migration 和 Seed，`shutdown` 销毁已经创建的 DatabaseManager。Drive 的存储
准备同样位于 `DriveProvider.boot`。因此 standalone 和 embedded 都直接启动
`Application`，不再维护独立的 Runtime prepare/dispose 阶段。手动 migrate/seed 命令使用
短生命周期的数据库任务函数，并在任务结束或失败时独立销毁连接，不需要创建 HTTP
Application。

Repository 与 Service 都以明确的 Token 注册，并保持各自的职责：

```text
AppSettingsProvider → appSettingsRepositoryToken
DatabaseProvider → databaseManagerToken
PublicFilesProvider → publicFilesRepositoryToken

Authentication plugin/provider → authenticationToken
Authorization plugin/provider  → authorizationToken
QueueProvider          → queueManagerToken
CachingProvider        → cachingToken
IdGeneratorProvider    → idGeneratorToken

AppServerKit RealtimeProvider → realtimeServiceToken
                              ├→ Plugin serviceContainer.resolve(token)
                              └→ WebSocket handler
```

Routes 和 Plugins 直接从 `ServiceContainer` 解析需要的 Token，不再创建 `AppDeps`
或 `AppRepositories` 聚合门面。跨包服务的 Token 由能力拥有者公开，例如
Database、Authentication、Authorization、Queue、Caching、ID Generator、Drive、Logging 和
Session；应用私有 Repository 的 Token 则由应用自己的 Provider 定义。Caching、ID Generator、
Drive、Logging、Queue 和 Session 的 Provider 都位于各自能力包中，默认应用只负责声明启用
哪些 Provider。Authentication 直接解析
`cachingToken` 和 `idGeneratorToken`，不再通过应用侧依赖桥转发。Realtime 由 Plugin
和 WebSocket 使用同一个公开 Token 从容器解析。

`ready` 表示 App 内部服务已经就绪，不表示某个具体 HTTP Server 已经监听端口。
这样 standalone、embedded 以及后续的 Koa、Fastify 等 Host Adapter 可以共享相同的
Provider 生命周期，而不需要让 Provider 感知承载它的网络框架。

`Application` 默认提供基于 `RealtimeService` 的 WebSocket 实现，并注册 App-local
`/ws` 端点；应用组合时不需要传入 WebSocket factory。默认实现位于
`@nocobase/app-server-kit/realtime`，通过 `realtimeServiceToken` 连接由
`RealtimeProvider` 注册的服务。`ApplicationOptions.websocket` 只保留为需要替换整个
WebSocket 接入实现时的高级覆盖入口。

## Client 的核心

Client 的核心就是 ReactProvider 和 Routes

```tsx
<BrowserRouter basename={config.app.basePath}>
  <ReactProviderTree providers={runtime.providers}>
    <Refine {...runtime.refine}>
      <AppRouter routes={runtime.routes} />
    </Refine>
  </ReactProviderTree>
</BrowserRouter>
```

扁平化

```bash
Config（从 window.nb_config 获取）
  ↓
ReactProviders
  ├── BrowserRouter
  ├── ThemeProvider
  └── Other Providers
  ↓
Refine
  ↓
Routes
  ↓
render
```
