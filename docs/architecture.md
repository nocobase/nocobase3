---
title: Architecture
description: NocoBase V3 应用架构：HTTP server 与 CLI 入口、embedded / standalone、runtime、service、jobs、route、middleware、frontend、migration 与 seed 的职责边界
---

# Architecture

这张图先看 runtime 的入口。Node 要对外提供 Web 服务，就会跑 `http.createServer`；CLI 也可以直接进入 runtime 做启动、迁移和初始化。`app-host` 本身也是一个 HTTP server，只不过它以 `embedded` 方式托管多个 app；`standalone` 则是一个 HTTP server 对一个 app。主链路保持几层大框，`Migration / Seed` 作为 runtime 之后可进入的初始化分支。

```text
┌──────────────────────────────────────────────┐
│               Runtime Entry                  │
│  HTTP Server: embedded / standalone          │
│  CLI: boot / migrate / seed                  │
└───────────────┬──────────────────────────────┘
                │
                ▼
┌──────────────────────────────┐
│           Runtime            │
│  config / deps / lifecycle   │
└───────────────┬──────────────┘
                │
                ├──────────────►  ┌──────────────────────┐
                │                 │   Migration / Seed   │
                │                 │ Migration: CLI/AUTO  │
                │                 │ Seed: CLI            │
                │                 └──────────────────────┘
                │
                ▼
┌──────────────────────────────┐
│        Business Logic        │
│   ┌──────────┐ ┌──────────┐  │
│   │ Service  │ │  Jobs    │  │
│   │ business │ │ async    │  │
│   └──────────┘ └──────────┘  │
└───────────────┬──────────────┘
                │
                ▼
┌──────────────────────────────┐
│        HTTP Interface        │
│   ┌──────────┐ ┌──────────┐  │
│   │  Route   │ │Middleware│  │
│   │ endpoint │ │  hooks   │  │
│   └──────────┘ └──────────┘  │
└───────────────┬──────────────┘
                │
                ▼
┌──────────────────────────────┐
│          Frontend            │
│   SSR HTML / SPA / assets    │
└──────────────────────────────┘
```

## Layer Responsibilities

### Runtime Entry

runtime 的直接入口有两类：`HTTP Server` 和 `CLI`。

- `HTTP Server`：对外提供 Web 服务时进入 runtime，`app-host` 属于 `embedded` 承载，`standalone` 属于一个 HTTP server 对一个 app。
- `CLI`：命令式进入 runtime，适合启动、迁移、seed 和其他初始化动作。

它们解决的是 runtime 由谁来驱动，不是业务分层本身。

### Runtime

`runtime` 负责应用运行所需的基础上下文，包括配置、运行依赖、启动准备和关闭释放。

- `config`：配置加载和默认值。
- `deps`：运行期依赖，例如 cache、logger、queue、session、drive 等 manager。
- `lifecycle`：prepare / dispose 等生命周期动作。

### Migration / Seed

`migration` 和 `seed` 都是在 runtime 之后进入的初始化动作。显式命令路径是 `CLI -> Runtime -> Migration / Seed`；`migration` 也可能由 runtime lifecycle 的 `AUTO_RUN` 自动触发。`migration` 负责 collection 构建，`seed` 负责数据初始化。

### Business Logic

`Service` and `Jobs` are peer parts of the business logic.

- `Service`：同步业务逻辑。
- `Jobs`：异步业务执行。

### HTTP Interface

`Route` 和 `Middleware` 是平级的 HTTP 边界。

- `Route`：对外暴露 endpoint 和响应结构。
- `Middleware`：处理请求进入 route 前后的横切逻辑。

### Frontend

这一层包含服务端渲染的 HTML 界面、SPA 形态的界面和前端 assets 资源。这些界面可以直接调用 HTTP API；服务端通过 HTTP interface 暴露能力并注入必要的 browser runtime 信息。
