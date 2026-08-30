---
title: 插件开发文档目录
description: 面向 AI Agent 的 NocoBase v3 插件开发文档入口，按快速开始、Database、Server、Client、I18n、Registry、Skills 和测试组织阅读路径。
---

# 插件开发

本目录面向负责开发 NocoBase v3 插件的 AI Agent。先从快速开始或开发工作流确定插件能力，再只读取当前任务对应的模块页；不需要按顺序加载全部文档。

## TOC

- [快速开始](./quick-start.md)
- [开发工作流](./development-workflow.md)
- [插件结构](./plugin-structure.md)
- 插件声明与注册
  - [插件声明](./plugin-declaration.md)
  - [插件注册](./plugin-registration.md)
- [公共契约](./public-contracts.md)
- Database
  - [Database 模块选择](./database.md)
  - [Migrations](./database-migrations.md)
  - [Seeds](./database-seeds.md)
- Server
  - [Server 模块选择](./server.md)
  - [Services、Tokens 与 ServiceProviders](./server-services-and-providers.md)
  - [Server Routes](./server-routes-examples.md)
    - [`defineApiRoutes()`](./server-routes-examples.md#示例一受认证保护的-api-route)
    - [`defineRootRoutes()`](./server-routes-examples.md#示例二root-route-拥有独立的安全边界)
  - [Jobs](./server-jobs.md)
- Client
  - [Client 模块选择](./client.md)
  - [Components](./client-components.md)
  - [Client Routes](./client-routes-examples.md)
    - [`defineAppRoutes()`](./client-routes-examples.md#最小-app-route)
    - [`defineSettingsRoutes()`](./client-routes-examples.md#最小-settings-route)
  - [Providers](./client-providers.md)
  - [Bootstrap](./client-bootstrap.md)
- [Plugin I18n](./i18n.md)
- [Plugin Registry](./registry.md)
- [Plugin Skills](./skills.md)
- [测试与验证](./testing.md)

## 按任务选读

| 当前任务                             | 先读                                    | 再读                                                                       |
| ------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------- |
| 创建并接入新插件                     | [快速开始](./quick-start.md)            | [插件声明](./plugin-declaration.md)、[插件注册](./plugin-registration.md)  |
| 实现完整业务插件                     | [开发工作流](./development-workflow.md) | 按 capability 进入 Database、Server 或 Client                              |
| 修改数据库结构                       | [Database 模块选择](./database.md)      | [Migrations](./database-migrations.md)                                     |
| 写入必要初始数据                     | [Database 模块选择](./database.md)      | [Seeds](./database-seeds.md)                                               |
| 提供 Server 领域能力                 | [Server 模块选择](./server.md)          | [Services、Tokens 与 ServiceProviders](./server-services-and-providers.md) |
| 添加 HTTP API、callback 或 webhook   | [Route 插件开发](./routes.md)           | [Server Routes](./server-routes-examples.md)                               |
| 添加异步后台任务                     | [Server 模块选择](./server.md)          | [Jobs](./server-jobs.md)                                                   |
| 提供 React 组件                      | [Client 模块选择](./client.md)          | [Components](./client-components.md)                                       |
| 添加 App 或 Settings 页面            | [Route 插件开发](./routes.md)           | [Client Routes](./client-routes-examples.md)                               |
| 多个页面共享 React Context           | [Client 模块选择](./client.md)          | [Providers](./client-providers.md)                                         |
| 添加命令式 Client 初始化             | [Client 模块选择](./client.md)          | [Bootstrap](./client-bootstrap.md)                                         |
| 为 Client、Server 或外发消息增加翻译 | [Plugin I18n](./i18n.md)                | [Components](./client-components.md)、[Jobs](./server-jobs.md)             |
| 向 App 交付可编辑 Client 源码        | [Plugin Registry](./registry.md)        | [公共契约](./public-contracts.md)                                          |
| 描述插件提供给 App Agent 的能力      | [Plugin Skills](./skills.md)            | [测试与验证](./testing.md)                                                 |

## Route 阅读路径

四种 Route API 属于同一个跨 Client/Server 专题。任何 Route 任务都先读 [Route 插件开发](./routes.md)，确定最终路径、所有权和安全边界，再进入对应实现页：

```text
defineApiRoutes() / defineRootRoutes()
  → Server Routes

defineAppRoutes() / defineSettingsRoutes()
  → Client Routes
```

Client 的 `auth/access` 只保护浏览器导航，不能替代 Server 安全策略。每个 Server Route 必须拥有并测试自己的 authentication/authorization 或协议特定安全边界。

## 阅读和验证原则

- 当前导出类型与运行时实现决定真实 API，文档用于说明标准开发路径；
- 只读取当前任务所需页面和匹配的可运行示例，避免复制整个示例插件；
- Plugin Skills 面向使用插件的 App Agent，不是插件源码开发手册；
- Registry materialized copy 归 App 所有，插件的 `registry/` 才是 canonical source；
- Inspector 只确认登记与最终 composition，不替代源码阅读、类型检查、行为测试和 runtime/full-stack 验证；
- 完成实现后按照[测试与验证](./testing.md)检查插件包和目标 App。

上一级总览见[插件开发](../plugin-development.md)。
