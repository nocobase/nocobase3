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
│ createAppServer() -> AppServer.fetch(request)                      │
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

### Server 组装（createAppServer）

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
createAppServer({ config, lifecycle }) App Server 组装
    │
    ├── Runtime + Services
    ├── bootstrap
    └── Routes + WebSocket + SPA
    │
    ▼
AppServer（Hono App）
    │
    ├── fetch(request)
    └── websocket(request)?
```

`config` 描述 App 如何运行，`services` 提供可复用能力，
`bootstrap` 负责启动扩展，`routes` 将请求连接到这些能力。

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
Config
  ↓
Services
  ├── Database
  ├── Router（Hono）
  ├── Logger
  ├── Cache
  └── Other Services
  ↓
Database
  ↓
Routes
  ↓
fetch / websocket
```

### Service Provider

最完整的生命周期

```bash
ServiceProvider
  ├── register
  ├── boot
  ├── start
  ├── ready
  └── shutdown
```

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
