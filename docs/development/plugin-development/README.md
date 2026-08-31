---
title: 插件开发文档目录
description: 面向 AI Agent 的 NocoBase v3 插件开发入口，按任务路由到核心工作流、模块指南和深入参考。
---

# 插件开发

本目录面向阅读文档并实现 NocoBase v3 插件的 AI Agent。不要顺序读取全部页面：先识别任务需要的 capability 和所有权，再读取一个模块选择页，只在复杂实现或诊断时进入深入参考。

## Agent 阅读协议

1. 新插件从[快速开始](./quick-start.md)进入；完整业务需求先读[开发工作流](./development-workflow.md)。
2. 根据任务选择 Database、Server、Client、I18n、Registry 或 Plugin Skills。
3. 每个模块先读选择页，再读本次需要的实现页，不加载同模块全部文档。
4. Route 是跨 Client/Server 专题，四种 Route API 都先读[Route 插件开发](./routes.md)。
5. Examples 和深入参考只在最小指南不足时读取。
6. 完成实现后按[测试与验证](./testing.md)验证行为；Inspector 只用于按需观察静态 composition，不是完成门槛。

## 按任务选读

| 任务                               | 首先读取                                | 按需深入                                                                |
| ---------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| 创建并接入新插件                   | [快速开始](./quick-start.md)            | [插件结构](./plugin-structure.md)、[插件注册](./plugin-registration.md) |
| 实现完整业务插件                   | [开发工作流](./development-workflow.md) | 按 capability 进入对应模块                                              |
| 声明插件能力或 package contract    | [插件声明](./plugin-declaration.md)     | [公共契约](./public-contracts.md)                                       |
| 修改数据库结构                     | [Database 模块选择](./database.md)      | [Migrations](./database-migrations.md)                                  |
| 写入必要初始数据                   | [Database 模块选择](./database.md)      | [Seeds](./database-seeds.md)                                            |
| 添加 Server Service                | [Server 模块选择](./server.md)          | [Services、Tokens 与 Providers](./server-services-and-providers.md)     |
| 添加 HTTP API、callback 或 webhook | [Route 插件开发](./routes.md)           | [Server Routes 示例](./server-routes-examples.md)                       |
| 添加后台任务                       | [Server 模块选择](./server.md)          | [Jobs](./server-jobs.md)                                                |
| 提供 React 组件                    | [Client 模块选择](./client.md)          | [Components](./client-components.md)                                    |
| 添加 App 或 Settings 页面          | [Route 插件开发](./routes.md)           | [Client Routes 示例](./client-routes-examples.md)                       |
| 共享 React Context                 | [Client 模块选择](./client.md)          | [React Providers](./client-react-providers.md)                          |
| 添加 Client Service 或启动初始化   | [Client 模块选择](./client.md)          | [Client ServiceProviders](./client-service-providers.md)                |
| 添加 Client 或 Server 翻译         | [Plugin I18n](./i18n.md)                | 页面内的 Advanced scenarios                                             |
| 交付 App-owned 可编辑 Client 源码  | [Registry 模块选择](./registry.md)      | [编写 item](./registry-authoring.md)、[交付](./registry-delivery.md)    |
| 描述插件提供给 App Agent 的能力    | [Plugin Skills](./skills.md)            | [测试与验证](./testing.md)                                              |
| 验证或诊断插件                     | [测试与验证](./testing.md)              | 对应模块的行为测试与 source of truth                                    |

## 核心工作流

- [快速开始](./quick-start.md)：创建、实现、注册和验证第一条成功路径。
- [开发工作流](./development-workflow.md)：把业务需求映射到所有权、capabilities、公开契约和验证。
- [插件结构](./plugin-structure.md)：生成文件、开发者维护文件和运行时所有权。
- [插件声明](./plugin-declaration.md)：Client、Server 和 package 对外声明契约。
- [插件注册](./plugin-registration.md)：根据环境选择 workspace、独立 App 或移除流程。
- [公共契约](./public-contracts.md)：App 与插件、插件与插件之间的稳定入口。
- [测试与验证](./testing.md)：按改动范围选择完成门槛。

## Database

- [Database 模块选择](./database.md)
- [Migrations](./database-migrations.md)
- [Seeds](./database-seeds.md)

## Server

- [Server 模块选择](./server.md)
- [Services、Tokens 与 ServiceProviders](./server-services-and-providers.md)
- [Server Routes 示例](./server-routes-examples.md)
- [Jobs](./server-jobs.md)

深入参考：

- [ServiceProvider 生命周期与装配](./service-provider.md)
- [ServiceToken 与 ServiceContainer 示例](./service-token-examples.md)

## Client

- [Client 模块选择](./client.md)
- [Components](./client-components.md)
- [Client Routes 示例](./client-routes-examples.md)
- [React Providers](./client-react-providers.md)
- [Client ServiceProviders](./client-service-providers.md)

## Route

四种 Route API 属于一个跨运行时专题：

- `defineApiRoutes()`：Server `/api` 业务 API；
- `defineRootRoutes()`：Server callback、webhook 或根路径协议入口；
- `defineAppRoutes()`：Client App 页面；
- `defineSettingsRoutes()`：Client Settings 页面。

任何 Route 任务先读[Route 插件开发](./routes.md)，然后只进入对应的 [Server](./server-routes-examples.md) 或 [Client](./client-routes-examples.md) 示例。Server Route 必须拥有自己的 authentication 和 authorization 边界，不能依赖 contribution order。

## Plugin I18n

- [Plugin I18n](./i18n.md)：统一介绍 Client 和 Server locale 声明、namespace、翻译边界和高级场景。

## Plugin Registry

- [Registry 模块选择](./registry.md)
- [编写 Registry item](./registry-authoring.md)
- [构建、发布与安装](./registry-delivery.md)
- [升级与移除](./registry-upgrades.md)
- [深入参考](./plugin-registry-reference.md)：完整字段、实现边界和可运行示例，普通任务不要默认加载。

## Plugin Skills

- [Plugin Skills](./skills.md)：插件声明自己提供给 App Agent 的能力和集成说明；插件 `skills/` 是源，App `.agents/skills/` 是同步结果。

## 注册深入页面

- [Source workspace 注册](./plugin-registration-workspace.md)
- [独立 App 安装与升级](./plugin-registration-installed.md)
- [解除注册与删除](./plugin-removal.md)
- [注册深入参考](./plugin-registration-reference.md)：完整命令、JSON 状态和不一致诊断，普通任务不要默认加载。

## 文档使用边界

- 以当前 v3 类型、导出和可运行示例为准，不套用 v2 `Plugin` class 或旧 scaffold 约定；
- “必须”表示运行时或工具契约；“示例”只展示一种实现；“当前限制”不应被推断为未来 API；
- 不为 Inspector 增加额外运行时代码；行为正确性由 tests、build 和真实运行验证；
- 只有在文档与类型或实现冲突时，才沿页面给出的 source of truth 检查源码。
