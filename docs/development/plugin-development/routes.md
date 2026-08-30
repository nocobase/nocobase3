---
title: Route 插件开发
description: 面向 AI Agent 的 NocoBase v3 四类 Route 开发、权限边界、前后端组合和分层验证指南。
---

# Route 插件开发

Route 是一个跨 Client 和 Server 的能力专题。NocoBase v3 提供四种 Route API：

| 需求                                | API                      | 运行位置 | 典型路径           |
| ----------------------------------- | ------------------------ | -------- | ------------------ |
| 顶层 HTTP 入口、webhook 或 callback | `defineRootRoutes()`     | Server   | `/callback`        |
| App 业务 API                        | `defineApiRoutes()`      | Server   | `/api/orders`      |
| 普通业务页面                        | `defineAppRoutes()`      | Client   | `/orders`          |
| Settings、管理或诊断页面            | `defineSettingsRoutes()` | Client   | `/settings/orders` |

先按需求选择 Route，再分别实现自己的路径、声明、安全边界和测试。不要从文件名或目录猜测 Route 类型。

## Server 和 Client 的边界

Server Route 看 `scope`：`root` 或 `api`。Client Route 看 `parent`：`app` 或 `settings`。

```text
Browser navigation
  → defineAppRoutes() / defineSettingsRoutes()
  → componentLoader()
  → App SDK / fetch
  → defineRootRoutes() / defineApiRoutes()
  → authentication + authorization
  → HTTP response
```

四类 Route 不会因为名称相同而自动配对。Client 的 `auth` 或 Settings 的 `access` 只保护浏览器侧导航，不能替代 Server authentication/authorization。每个 Server Route 都必须安装并测试自己的边界，不能依赖其他 contribution 或当前 composition order。

## 四类 Route

### `defineRootRoutes()`

顶层 HTTP Route 不自动位于 `/api` 下。Route factory 返回自己的 Hono router，路径相对于应用的 root router。它可以是认证 Route，也可以有意设计为公开入口；公开时必须限制数据、记录意图并测试匿名请求。

### `defineApiRoutes()`

API Route 挂载到 `/api` scope，代码中的路径不重复写 `/api`。`/api` 只表示挂载位置，不表示请求已经认证。Route 必须在自己的 router 上声明 authentication 和 authorization。

### `defineAppRoutes()`

普通 App 页面使用 `parent: 'app'`。路径不重复 App public base path；页面使用 lazy `componentLoader`。`auth: 'required'`、`guest` 或 `optional` 控制 Client navigation，不是 Server ACL。

### `defineSettingsRoutes()`

Settings 页面仍然属于 Client `routes` entry，不存在独立 settings loader。路径相对于内置 Settings Route，不要在 path 中重复 `/settings`。敏感页面应声明 `navigation` 和 `access`；access 被拒绝时页面不会进入可用导航，也不会加载页面组件。

## 前后端组合规则

需要页面和接口时，通常同时提供一个 Client App Route 与一个 Server API Route。页面通过 App SDK 调用 API；页面的 `auth` 和 API 的 authentication 必须分别存在。需要顶层 callback 时再增加 Root Route，不要把业务 API 随意放到 root scope。

App 的 public base path 由宿主恢复。插件 Route 只写 App 内部路径：不要把 `/main` 或其他部署前缀写进 Route path。

## Inspect 和验证

```bash
pnpm plugin:inspect <name> --app <app> --json
pnpm --filter <app> server:inspect --json
pnpm --filter <app> client:inspect --json
```

- `plugin:inspect` 检查安装、登记、显式 Client/Server 注册和 Skills 状态；
- `server:inspect` 检查 Server contribution 的 `scope`、顺序和来源，不执行 Route factory；
- `client:inspect` 解析 Client Route/Provider factory，可以执行 routes/providers factory，但不执行 bootstrap、不加载页面 `componentLoader`、不渲染 Provider，也不验证 Server 安全。

Inspector 成功只证明 declaration 和 composition 可解析。继续用行为测试验证匿名/已认证请求、authorization、页面 loader、Settings access 和真实页面到 API 的闭环。

## 推荐参考

`packages/app-plugin-routes-example` 是前后端 Route 的规范示例，覆盖 Root/API/App/Settings 四类 Route，并展示独立的安全和导航边界。不要把它当作通用插件模板复制；只复制与当前需求对应的 Route 和测试结构。

其他能力请阅读对应的真实插件：

| 能力                     | 参考                        |
| ------------------------ | --------------------------- |
| Settings Route 和 access | `app-plugin-authorization`  |
| Bootstrap                | `app-plugin-authentication` |
| Client Provider          | `app-plugin-routes-example` |
| Plugin Skill             | `app-plugin-skills-example` |

## 完成条件

- Route 类型、scope/parent 和最终路径明确；
- 每个 Server Route 自有 authentication/authorization 边界；
- App/Settings Route 的 auth/access 明确；
- Client 页面保持 lazy loading；
- Server/Client declaration、exports 和 App composition 一致；
- `server:inspect`、`client:inspect` 和行为测试均通过；
- 需要页面和接口时完成真实前后端闭环验证。
