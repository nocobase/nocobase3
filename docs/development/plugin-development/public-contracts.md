---
title: 设计插件公共契约
description: 为 NocoBase 插件设计稳定的 Client exports、Server ServiceTokens、HTTP API、Client options 和跨插件依赖，并控制私有实现与公共集成面的边界。
---

# 设计插件公共契约

公共契约是 App 或其他插件可以依赖的稳定入口。先确定调用方，再选择最窄的入口；没有调用者的内部实现不应为了“方便”全部导出。

## 按调用关系选择入口

| 调用关系                | 推荐入口                                        |
| ----------------------- | ----------------------------------------------- |
| 插件内部模块            | 内部文件直接 import                             |
| Server 进程内跨插件调用 | 稳定 package export + ServiceToken              |
| Browser 跨插件组合      | Client public component、hook 或 factory export |
| Browser 调用 Server     | public API Route                                |
| App 配置 Client 插件    | typed Client options                            |
| App Agent 集成插件      | Plugin Skills                                   |

不要让调用方从源码深层路径 import，也不要为同一能力同时制造多个没有边界的入口。

## Server 契约

由能力拥有插件定义接口和 `ServiceToken`；调用方从稳定 export 导入同一个 Token，不重新创建同名 Token。Route 是 HTTP 边界，负责输入验证、身份和响应；同进程调用优先使用 Service，而不是绕一圈 HTTP。

```text
@nocobase/app-plugin-audit-log/server/tokens
→ AuditLogService + auditLogToken
@nocobase/app-plugin-audit-log/server
→ server definition（由 App 显式注册）
```

Token 接口应描述行为而不是默认实现。明确返回值、错误、幂等性、生命周期和是否需要调用上下文。不要 export 未承诺的内部 service class 或数据库表结构。

如果其他 package 需要导入 Token，为它增加明确的 source 和 publish export，例如 `./server/tokens`；仅存在源码文件不构成公共契约。

## Client 契约

`exports["./client"]` 返回 Client plugin factory；插件只使用 `bootstrap`、`routes`、`providers` 三类 runtime contribution entry，并可通过 `locales` 声明翻译资源。App 通过 typed options 配置稳定行为，页面通过 routes，跨页面状态通过 providers。重组件使用 lazy loader；可复用的组件、hook 或 factory 只有在确实需要跨插件组合时才单独 export。

```ts
auditLog({ resourceLabel: 'Audit logs' });
```

Options 必须可由 App 在注册时明确提供，不依赖隐藏环境变量或全局状态。组件覆盖使用公开的 `routeComponentOverrides` surface，不复制宿主页面。

`./client` 是 App 注册 Client plugin 的固定入口。单独导出的 component、hook 或 factory 应使用有意设计的 subpath，并在 source/publish exports 中保持一致；不要把整个 `client/` 目录暴露成任意深层 import。

## API 契约

API 路径、HTTP method、输入、响应、错误状态和权限属于公共契约。可翻译 error 还应保留稳定 `code/ns/key/params`，而不是只返回已经翻译且无法重新解释的 message。`defineApiRoutes()` 的路径挂在 `/api` 下；不要让调用方猜测 base path、用户身份或内部数据库字段。Root Route 只用于明确不属于 `/api` 的入口。

## App 和插件的所有权

```text
App owns       页面组合、业务 collection、调用时机、权限配置
Plugin owns    运行时服务、公共组件/Token/Route、内部数据和生命周期
Public surface package exports、API、Client options、Registry item、Plugin Skills
Never bypass   私有模块、内部表、同步后的 .agents/skills 副本
```

如果 App 需要创建 collection 或配置权限，插件不应偷偷在运行时修改 App 定义；应在 Plugin Skills 中说明前置条件和配置步骤。

## 版本和兼容性

只有稳定、可测试、能说明兼容边界的能力才公开。修改名称、路径、参数、响应、options 或权限要求时，将其视为契约变化：更新测试、exports、CHANGELOG 和 Plugin Skills，并评估是否需要兼容层或 breaking version。

内部重构、默认实现替换或文件移动如果没有改变公共 surface，不应迫使调用方修改，也不需要在 Plugin Skills 中暴露实现细节。

## 公共契约检查清单

- 入口由能力拥有者定义，调用方不重建 Token；
- source exports 与 publish exports 成对存在；
- 输入输出和错误可以被调用方可靠处理；
- 权限、身份、数据边界和生命周期明确；
- 没有泄漏私有实现或内部表；
- 有行为级测试和目标 App 集成验证；
- Plugin Skills 描述真实入口、集成流程、约束和验证方式。

## 相关内容

- [插件声明](./plugin-declaration.md)
- [Server 模块选择](./server.md)
- [Services、Tokens 与 ServiceProviders](./server-services-and-providers.md)
- [Client 模块选择](./client.md)
- [Client Components](./client-components.md)
- [Plugin Registry](./registry.md)
- [描述插件提供给 App 的能力](./skills.md)
- [测试和验证插件](./testing.md)
