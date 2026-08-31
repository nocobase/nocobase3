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

| 已选择的 Route                                | 继续阅读                                                 |
| --------------------------------------------- | -------------------------------------------------------- |
| `defineRootRoutes()`、`defineApiRoutes()`     | [Server Route 最佳实践示例](./server-routes-examples.md) |
| `defineAppRoutes()`、`defineSettingsRoutes()` | [Client Route 最佳实践示例](./client-routes-examples.md) |

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

四类 Route 不会因为名称相同而自动配对。Client 的 `auth` 或 Settings 的 `access` 只保护浏览器侧导航，不能替代 Server security。每个 Server Route 都必须明确拥有并测试自己的安全策略，不能依赖其他 contribution 或当前 composition order。登录用户 Route 按需求安装 authentication 和 authorization；有意公开的 webhook/callback 必须记录公开原因，并实现和测试签名、state、时间戳、重放保护、幂等或协议要求的其他边界。

## 四类 Route

### `defineRootRoutes()`

顶层 HTTP Route 不自动位于 `/api` 下。Route factory 返回自己的 Hono router，路径相对于应用的 root router。它可以是认证 Route，也可以有意设计为公开入口；公开时必须限制数据、记录意图并测试匿名请求。

### `defineApiRoutes()`

API Route 挂载到 `/api` scope，代码中的路径不重复写 `/api`。`/api` 只表示挂载位置，不表示请求已经认证。Route 必须在自己的 router 上声明 authentication 和 authorization。

### `defineAppRoutes()`

普通 App 页面使用 `parent: 'app'`。路径不重复 App public base path；页面使用 lazy `componentLoader`。`auth: 'required'`、`guest` 或 `optional` 控制 Client navigation，不是 Server ACL。

### `defineSettingsRoutes()`

Settings 页面仍然属于 Client `routes` entry，不存在独立 settings loader。路径相对于内置 Settings Route，不要在 path 中重复 `/settings`。敏感页面应声明 `navigation` 和 `access`；access 被拒绝时页面不会进入可用导航，也不会加载页面组件。

## 选择内部实现结构

Server Route 只有少量 handler 时，直接写在 `defineApiRoutes()` 或
`defineRootRoutes()` factory 中。存在多个 handler、共享错误处理或独立业务子域时，
可以抽取 `createXxxRoutes(options): Hono`，由 contribution factory 解析 Token 后挂载
这个子 router。不要仅为了测试导出修改调用方 router 的
`registerXxxRoutes(router, ...): void`；测试可以直接执行真实 contribution 的
`createRouter()`。完整代码见 [Server Route 最佳实践示例](./server-routes-examples.md)。

Client 普通页面使用 `defineAppRoutes()`，Settings 页面使用
`defineSettingsRoutes()`。只替换插件页面 UI 时使用 Route component override，不要重复
声明 Route；多个页面共享 React Context 时使用 `client/react-wrappers/`，不要把 React Wrapper
职责塞进 Route declaration。完整代码见
[Client Route 最佳实践示例](./client-routes-examples.md)。

## 前后端组合规则

需要页面和接口时，通常同时提供一个 Client App Route 与一个 Server API Route。页面通过 App SDK 调用 API；页面的 `auth` 和 API 的 authentication 必须分别存在。需要顶层 callback 时再增加 Root Route，不要把业务 API 随意放到 root scope。

App 的 public base path 由宿主恢复。插件 Route 只写 App 内部路径：不要把 `/main` 或其他部署前缀写进 Route path。

## 按需装配诊断和行为验证

新增、删除或重排 Route contribution，或者排查 Route 为什么没有进入目标 App 时，可以按变化范围运行对应 Inspector。只修改 handler、权限逻辑或页面行为时，不需要为了完成流程固定运行这些命令：

```bash
pnpm plugin:inspect <name> --app <app> --json
pnpm --filter <app> server:inspect --json
pnpm --filter <app> client:inspect --json
```

- `plugin:inspect` 检查安装、登记、显式 Client/Server 注册和 Skills 状态；
- `server:inspect` 检查 Server contribution 的 `scope`、顺序和来源，不执行 Route factory；
- `client:inspect` 读取静态 Client Route 和 React Wrapper declarations，但不实例化 ServiceProvider、不执行 lifecycle、不加载页面 `componentLoader`、不渲染 React Wrapper，也不验证 Server 安全。

Inspector 只提供 declaration/composition 的只读快照；命令成功或 `consistent: true` 都不能证明 Route 正确或安全。使用行为测试验证匿名/已认证请求、authorization、页面 loader、Settings access 和真实页面到 API 的闭环。

主要验证分两层：contribution test 执行真实 factory、Token、middleware 和 handler；目标
App integration test 验证最终 URL、public base path、多个 contributions、真实登录和权限。
Inspector 仅在需要时辅助观察装配，不构成第三层行为验证。复杂 Server Route 可以单独测试
领域子 router，但仍要测试 production contribution 的 wiring。

## 推荐参考

`packages/app-plugin-routes-example` 是前后端 Route 的规范示例，覆盖 Root/API/App/Settings 四类 Route，并展示独立的安全和导航边界。不要把它当作通用插件模板复制；只复制与当前需求对应的 Route 和测试结构。

- Root/API 的实现和测试模式见 [Server Route 最佳实践示例](./server-routes-examples.md)；
- App/Settings 的实现和测试模式见 [Client Route 最佳实践示例](./client-routes-examples.md)。

其他能力请阅读对应的真实插件：

| 能力                     | 参考                        |
| ------------------------ | --------------------------- |
| Settings Route 和 access | `app-plugin-authorization`  |
| Bootstrap                | `app-plugin-authentication` |
| Client Provider          | `app-plugin-routes-example` |
| Plugin Skill             | `app-plugin-skills-example` |

## 完成条件

- Route 类型、scope/parent 和最终路径明确；
- 每个 Server Route 的安全策略明确并经过行为测试；
- 需要登录或权限时，由自己的 contribution 安装 authentication/authorization；
- 有意公开的 Route 记录公开原因并测试协议特定边界；
- App/Settings Route 的 auth/access 明确；
- Client 页面保持 lazy loading；
- Server/Client declaration、exports 和 App composition 一致；
- 相关行为测试通过；发生 composition 变化时，按需查看的 Inspector 快照没有相关装配问题；
- 需要页面和接口时完成真实前后端闭环验证。
