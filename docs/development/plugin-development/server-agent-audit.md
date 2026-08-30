---
title: Server 插件 Agent 友好性审计
description: NocoBase v3 Server 插件可观察性、Route 安全边界、Provider ownership 和 Queue Job inspection 的只读审计结果。
---

# Server 插件 Agent 友好性审计

本文记录对当前 v3 Server 插件底层实现的只读审计，以及基于审计落地的
`server:inspect` 边界。目标是区分当前可以可靠报告的声明事实，以及只能通过运行时或测试确认的行为。

审计范围：

- `@nocobase/app-server-kit/plugins` 的插件定义和解析；
- `@nocobase/app-server-kit/router` 的 Route contribution；
- `Application.addServerPlugins()`、Provider 和 Route 生命周期；
- `ServiceContainer`、`ServiceProviderRegistry`；
- Queue Job location 和 `@nocobase/queue` 的 Job 注册；
- `app-template-default` 及现有 `app-plugin-*` examples。

## 结论摘要

| 领域                               | 当前可检查程度 | 结论                                                                                                  |
| ---------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| Server plugin package/order        | 高             | `defineServerPlugins()` 保留 package name 和顺序，并拒绝重复 package。                                |
| Provider presence/order            | 中             | composition 中能知道 Provider constructor 数量和顺序；不能从 constructor 静态知道它注册了哪些 token。 |
| ServiceToken ownership             | 低             | token 只有运行时 `name`，Provider 的 `container.singleton()` 是任意代码，当前没有声明式 ownership。   |
| Route scope                        | 高             | `defineApiRoutes()` / `defineRootRoutes()` 明确保留 `scope`。                                         |
| Route method/path                  | 低             | method/path 只在 Route factory 运行后存在于 Hono router；contribution 本身没有 metadata。             |
| Route authentication/authorization | 低             | 当前没有安全 contract 字段；只能阅读实现或发真实请求验证。                                            |
| Queue Job location                 | 中             | plugin definition 和 resolved metadata 保留 package-relative location 及 glob。                       |
| Queue Job name/queue/owner         | 低             | Job class 在 glob 扫描并加载后才注册到全局 `Locator`，当前没有 owner metadata 或冲突报告。            |
| Database migration/seed source     | 中             | package、目录和解析结果结构化可见，但 migration 内部 schema 仍必须用真实数据库测试。                  |

总体判断：当前底层适合实现“静态 Server composition inspection”，不适合实现一个声称
“已经验证所有 Provider、Route 权限和 Job 正确性”的全能 doctor。

## 已确认的运行时事实

### Plugin 和 composition order

`defineServerPlugin()` 会把缺省 `providers` 和 `routes` 归一化为空数组并冻结；
`defineServerPlugins()` 保留数组顺序并按 `packageName` 拒绝重复项。

`Application.addServerPlugins()` 依次：

1. 按插件顺序添加 Providers；
2. 按插件顺序添加 Routes；
3. 之后由 Application 按注册顺序运行 Provider lifecycle；
4. 再按 Route contribution 顺序创建并挂载 Hono router。

这足以支持以下静态检查：

- 插件是否出现在 Server composition root；
- 插件顺序；
- 每个插件声明了多少 Provider、Route、Database source、Job location；
- Root/API scope 的数量和顺序。

它不能证明 Provider 的实际副作用或 Route 的实际 handler 行为。

### Provider 和 ServiceToken

`ServiceProviderLifecycle` 只有 `name` 及五个生命周期方法。`ServiceProviderRegistry`
只根据 Provider `name` 检测重复；`ServiceContainer` 的 `instance()` 和 `singleton()`
可以在任意 `register()` 代码中绑定 token。

因此存在三个边界：

- 可以报告 Provider constructor 的 class/name（运行 constructor 才能稳定得到 instance name）；
- 不能在不执行 `register()` 的情况下推断它绑定了哪些 token；
- 即使执行 `register()`，也会产生副作用，并且 token binding 可能依赖配置、环境或其他 Provider。

这些边界不是 Inspector 应自动补齐的 metadata。只有真实插件开发反复出现 Token owner
或依赖无法定位的问题时，才单独评估是否需要新的运行时 contract。

### Routes 和安全边界

`AppApiRouteContribution` 与 `AppRootRouteContribution` 当前只有：

```ts
{
  scope: 'api' | 'root',
  createRouter(app): Hono
}
```

method、path、middleware 和 handler 都在 `createRouter()` 内任意定义。Hono 实例运行后
可以读取 `router.routes`，但此时必须执行 factory；若 factory 解析 ServiceToken、读取
数据库或依赖配置，inspection 就不再是纯静态操作。

更严重的是，当前 Route contribution 没有 authentication/authorization metadata。
Route 是否安全只能通过：

- 阅读 factory 内是否显式使用 `authenticationToken` / `authorizationToken`；
- 对未认证、无权限和有权限请求发真实请求；
- 改变 composition order 后重复请求，确认安全语义不变。

审计发现 `app-plugin-routes-example` 的 Server Route 没有 `auth.required()`，其测试也
明确期望匿名请求返回 200；但 README 同时称页面和 API 都 authenticated，并把保护归因于
App 的共享 `/api/*` middleware。当前 `app-template-default/server/app.ts` 注册的是
session middleware，并没有全局认证 middleware。因此该 example 暴露了一个 P0 文档/实现
不一致：Route 不能依赖宿主或 contribution order 提供安全边界。

当前不为了 Inspector 增加独立的 Route security metadata。若真实开发反复出现路径、
middleware 或权限样板错误，应优先评估改进 Route authoring contract，让可检查性成为
真实运行时声明的结果，而不是另维护一份仅供 Inspector 使用的信息。

### Queue Jobs

Server plugin 的 `queue.jobs` 是 package-relative 路径数组。解析后只得到：

- plugin package name；
- package root；
- 一个或多个迁移/seed 目录；
- Job location glob。

Queue provider 将这些 locations 放入 queue config。Job class 被扫描加载后，才通过
`Locator.register(JobClass.options?.name ?? JobClass.name, JobClass)` 注册。由此产生：

- 可静态报告 job location 是否存在；
- 不能只通过 plugin definition 报告 Job name、queue 或 payload；
- name 冲突属于全局 Locator 运行时行为，当前没有 owner-aware 错误；
- queue 名称来自 Job static options 或 dispatch options，不能从 location 推断。

当前不为了 Inspector 加载 Job module 或新增 Job manifest。Agent 必须用实际 handler
测试覆盖名称、payload、queue、重试和失败结果；只有当真实 Job 开发反复出现
owner 或冲突问题时，才单独评估新的运行时 contract。

## `server:inspect --json` 已实现边界

命令会导入 App 的 `server/plugins.ts` 和其声明依赖，因此这些模块的顶层代码必须
保持无运行时启动副作用。Inspector 不构造 Provider、不执行 lifecycle 或 Route factory、
不连接数据库、不启动 worker、不加载 Job module。

当前 envelope：

```json
{
  "schemaVersion": 1,
  "ok": true,
  "operation": "server:inspect",
  "status": "success",
  "result": {
    "app": {},
    "plugins": [],
    "providers": [],
    "routes": [],
    "database": [],
    "jobs": [],
    "issues": []
  }
}
```

第一版可靠字段：

- plugin package name、composition order、definition 是否存在；
- Provider constructor 的 best-effort 可读 name，仅用于调试定位；
- Route contribution 的 scope、插件 owner 和 contribution order；
- migration/seed 路径是否存在；
- Job location、解析后的 glob、目录缺失；
- Route 单数组中的真实 contribution registration order。

文档必须明确说明、Inspector 不能伪造的信息：

- ServiceToken provides/requires；
- Route method/path（除非显式执行 factory）；
- authentication/authorization 是否存在或策略是否正确；
- Job class name、queue、payload 和 runtime Locator 状态；
- migration schema correctness、数据库连接和运行时副作用。

当前只报告可靠的路径问题：

```text
SERVER_MIGRATIONS_DIRECTORY_MISSING
SERVER_SEEDS_DIRECTORY_MISSING
SERVER_JOB_LOCATION_MISSING
```

`defineServerPlugins()` 已直接拒绝重复 package，Provider constructor name 不是稳定身份，
所以 Inspector 不重复报告这两类问题。当前也不扫描 factory 源码、不推断权限、
不加载 Job module、不自动修复或重排 contribution。

## 后续改进原则

Inspector 保持 declaration snapshot 职责。只有当真实插件开发反复出现无法解决的
Route authoring、Token ownership 或 Job collision 问题时，才单独设计服务于运行时正确性的新
contract。不为了扩展 Inspector 输出而增加另一套 metadata。
