---
title: 插件开发
description: 在 NocoBase source workspace 中创建、修改、注册和验证 App 插件，并根据需求选择 Client、Server、Database、Queue、Skills 或 Registry 能力。
---

# 插件开发

本指南面向负责开发 NocoBase v3 插件的 AI Agent。处理任务时，先确定目标插件和目标 App，再判断需求属于 Client、Server、Database、Queue、Skills 还是 Registry。只读取与当前任务相关的章节，不需要按顺序加载全部文档。

第一版 Create Plugin 只在 NocoBase source workspace 中创建插件。workspace 根目录包含 `packages/` 和 `pnpm-workspace.yaml`，新插件固定创建到 `packages/app-plugin-<name>/`。独立 App 可以安装和注册已发布插件，但第一版不在独立 App 中创建 standalone 插件工程。

Create Plugin 没有隐式插件类型。新插件必须用可重复的 `--with` 显式选择 `database`、`server.providers`、`server.routes`、`server.jobs`、`client.routes`、`client.components`、`client.providers`、`client.bootstrap`、`registry` 或 `skills`；只创建 package foundation 时显式使用 `--empty`。Agent 应先运行 `--dry-run --json` 检查生成计划。

## 标准工作流

处理任何插件开发任务时：

1. 读取仓库根目录以及目标目录下适用的 `AGENTS.md`。
2. 检查工作区状态，保留用户已有修改，不回退无关文件。
3. 确认目标插件和目标 App；新插件默认接入 `app-template-default`。
4. 判断是创建新插件还是修改已有插件。
5. 检查插件的 `package.json`、`client/plugin.ts` 和 `server/plugin.ts`，确认当前公开能力。
6. 将需求分类到 Client、Server、Database、Queue、Skills 或 Registry。
7. 只读取与本次任务相关的专题和可运行 example。
8. 在拥有该能力的插件包中实现最小完整改动，不把领域逻辑放进 App Template。
9. 添加或更新行为级测试；测试统一放在插件根目录的 `tests/` 下。
10. 如果插件向 App 提供的能力、公开集成契约、集成流程、输入、权限、约束或验证方式发生变化，更新插件顶层 `skills/`。
11. 运行插件自己的 lint、typecheck、test 和 build。
12. 运行目标 App 的相关 typecheck、test、build；涉及 Client 时还要检查最终 Client contributions。
13. 报告实现行为、修改范围、测试、验证结果、假设和剩余限制。

## 按任务选择章节

| 用户目标                             | 能力类型           | 主要修改位置                             | 阅读                                                             |
| ------------------------------------ | ------------------ | ---------------------------------------- | ---------------------------------------------------------------- |
| 创建新插件并接入 App                 | Plugin lifecycle   | `packages/app-plugin-<name>/`            | [快速开始](./plugin-development/quick-start.md)                  |
| 判断生成文件是否需要保留             | Package structure  | 插件根目录                               | [插件结构](./plugin-development/plugin-structure.md)             |
| 声明 Client 或 Server 能力           | Plugin declaration | `client/plugin.ts`、`server/plugin.ts`   | [插件声明](./plugin-development/plugin-declaration.md)           |
| 安装、启用、配置或移除插件           | Registration       | App manifest 和 composition roots        | [插件注册](./plugin-development/plugin-registration.md)          |
| 添加 HTTP 接口或浏览器页面           | Route              | `client/routes.ts`、`server/routes/`     | [Route 插件开发](./plugin-development/routes.md)                 |
| 添加业务服务                         | Server             | `server/`                                | [Server 插件开发](./plugin-development/server.md)                |
| 创建数据库结构或初始数据             | Database           | `database/`                              | [数据库迁移和初始数据](./plugin-development/database.md)         |
| 添加页面、Settings 或 React Provider | Client             | `client/`                                | [Client 插件开发](./plugin-development/client.md)                |
| 添加后台任务                         | Queue Job          | `server/jobs/`                           | [Server 插件开发](./plugin-development/server.md)                |
| 描述插件向 App 提供的能力和集成方式  | Skills             | `<plugin>/skills/`                       | [描述插件提供给 App 的能力](./plugin-development/skills.md)      |
| 向 App 安装可编辑 UI 源码            | Registry           | `<plugin>/registry/`                     | Registry（能力范围待定）                                         |
| 验证或发布插件                       | Quality/Publishing | `tests/`、`package.json`、`CHANGELOG.md` | [测试和验证插件](./plugin-development/testing.md)                |
| 编排真实业务插件开发                 | Workflow           | 插件全部能力和目标 App                   | [开发一个完整插件](./plugin-development/development-workflow.md) |
| 设计跨插件或 App 公共入口            | Public contract    | `exports`、Token、API、options、Skills   | [设计插件公共契约](./plugin-development/public-contracts.md)     |

## 能力选择

```text
需求运行在哪里？
├── Browser
│   ├── Refine 初始化         → client/bootstrap.ts
│   ├── 普通页面              → client/routes.ts → defineAppRoutes()
│   ├── Settings 页面         → client/routes.ts → defineSettingsRoutes()
│   └── React Context         → client/providers.ts
│
├── Server
│   ├── 业务逻辑              → Service
│   ├── 跨模块稳定契约        → ServiceToken
│   ├── 注册和生命周期        → ServiceProvider
│   ├── /api 接口             → defineApiRoutes()
│   ├── 顶层 HTTP 入口        → defineRootRoutes()
│   ├── Schema 变化           → Migration
│   ├── 初始数据              → Seed
│   └── 后台任务              → Queue Job
│
├── 插件向 App 提供什么、如何集成和使用 → skills/
└── 安装后归 App 的可编辑源码 → registry/
```

## 当前稳定协议

- Client 插件只有 `bootstrap`、`routes` 和 `providers` 三类入口，且全部可选。
- Settings 页面属于 `routes`，使用 `defineSettingsRoutes()` 声明；没有独立 `settings` loader。
- Server Routes 是直接传给 `defineServerPlugin()` 的 route contributions，不使用 loader。
- 每个 Server Route 必须拥有并测试自己的 authentication 和 authorization 边界，不能依赖其他 contribution 的 middleware 或当前 composition order 提供保护。
- Client 和 Server 分别通过 App 的 `client/plugins.ts` 与 `server/plugins.ts` 显式注册。
- `package.json#nocobase.plugins` 是安装、CLI、构建、开发监听和 Skills 同步所需的管理元数据，不承担 Client 或 Server 运行时发现。
- `exports["./client"]` 是 Client 注册判据；`exports["./server/plugin"]` 是 Server 注册判据。
- Database migrations、seeds 和 Queue jobs 都由 Server 插件声明。
- Plugin Skills 是插件拥有的 App 能力与集成指南：描述公共能力、集成流程、边界和验证方式；源文件位于顶层 `skills/`，并同步到 App 的 `.agents/skills/` 供 App Agent 使用。
- Registry 是可选扩展能力，不属于第一版快速开始的运行闭环。

## 信息来源优先级

遇到内容不一致时，按以下顺序判断：

1. 最近作用域的 `AGENTS.md` 决定工程约束。
2. 当前导出类型和运行时实现决定 API 的真实形态。
3. `@nocobase/create-plugin` 模板决定新插件的标准生成结果。
4. 本插件开发指南决定标准开发流程。
5. 可运行 example 提供完整实现参考。
6. Package README 提供包级补充说明。
7. 设计文档和 CHANGELOG 只用于理解背景，不作为当前操作契约。

## 完成标准

插件开发任务只有在以下条件满足后才算完成：

- 请求的行为由正确的插件包拥有并实现；
- 使用到的 Client 或 Server 能力已经通过插件声明公开；
- 目标 App 的依赖、管理元数据和显式注册与预期一致；
- 未使用的脚手架示例没有被误当作真实功能保留；
- 测试覆盖本次改变的行为，而不只断言文件或字符串存在；
- 插件向 App 提供的能力和集成知识变化已经反映到 `skills/`，并在适用时与 App 的同步副本一致；
- 修改过的插件通过 lint、typecheck、test 和 build；
- 目标 App 的相关集成检查通过；
- 最终报告列出执行过的验证及其结果。

## 文档导航

- [创建并接入插件](./plugin-development/quick-start.md)
- [插件结构和文件所有权](./plugin-development/plugin-structure.md)
- [声明 Client 和 Server 插件](./plugin-development/plugin-declaration.md)
- [安装和注册插件](./plugin-development/plugin-registration.md)
- [Server 插件开发](./plugin-development/server.md)
- [Server 插件 Agent 友好性审计](./plugin-development/server-agent-audit.md)
- [Route 插件开发](./plugin-development/routes.md)
- [Server Route 最佳实践示例](./plugin-development/server-routes-examples.md)
- [Client Route 最佳实践示例](./plugin-development/client-routes-examples.md)
- [Client 插件开发](./plugin-development/client.md)
- [数据库迁移和初始数据](./plugin-development/database.md)
- [描述插件提供给 App 的能力](./plugin-development/skills.md)
- [测试和验证插件](./plugin-development/testing.md)
- [开发一个完整插件](./plugin-development/development-workflow.md)
- [设计插件公共契约](./plugin-development/public-contracts.md)
- [CLI 完整命令参考](../cli/README.md)
