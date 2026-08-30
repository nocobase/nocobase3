---
title: 插件结构和文件所有权
description: 识别 NocoBase 插件中 Client、Server、Database、Queue、Skills、Registry、测试和发布文件的职责，并区分必需契约与可删除的脚手架示例。
---

# 插件结构和文件所有权

Create Plugin 生成一个可发布的 workspace package。Agent 不应根据目录名猜测运行时能力，而应结合 `package.json` exports、Client/Server 插件声明和目标 App composition roots 判断真实状态。

## 标准目录

完整脚手架的主要结构如下：

```text
packages/app-plugin-audit-log/
├── client/
│   ├── components/
│   ├── pages/
│   ├── bootstrap.ts
│   ├── contexts.ts
│   ├── index.ts
│   ├── plugin.ts
│   ├── providers.ts
│   ├── routes.ts
│   └── styles.css
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── README.md
├── registry/
├── server/
│   ├── providers/
│   ├── routes/
│   ├── services/
│   ├── plugin.ts
│   └── tokens.ts
├── skills/
│   └── nocobase-app-plugin-audit-log/
│       └── SKILL.md
├── tests/
├── CHANGELOG.md
├── README.md
├── components.json
├── eslint.config.js
├── package.json
├── registry.config.json
└── tsconfig.json
```

`server/jobs/` 只有在插件真正添加 Queue Jobs 时才需要存在。Migration 和 Seed 示例以 `.ts.example` 结尾，默认不执行。

## 顶层能力和所有权

| 路径           | 职责                                  | 是否必需                           |
| -------------- | ------------------------------------- | ---------------------------------- |
| `client/`      | Browser runtime contributions         | 仅 Client 插件需要                 |
| `server/`      | Server runtime contributions          | 仅 Server 插件需要                 |
| `database/`    | Migrations 和 Seeds                   | 需要持久化 schema 或初始数据时使用 |
| `server/jobs/` | Queue Jobs                            | 需要异步任务时使用                 |
| `skills/`      | 插件向 App Agent 提供的能力与集成指南 | App Agent 需要发现插件能力时维护   |
| `registry/`    | 安装后归 App 所有的可编辑源码         | 可选；第一版不属于核心路径         |
| `tests/`       | 插件行为和集成契约测试                | 修改行为时必须维护                 |
| `package.json` | 包导出、依赖、发布和插件管理 metadata | 必需                               |
| `CHANGELOG.md` | npm 发布变更                          | 所有 `packages/` 发布包必需        |

所有权边界：

```text
Plugin runtime source
├── client/**
├── server/**
└── database/**
    → 插件拥有，随插件升级

Plugin App integration knowledge
└── skills/**
    → 插件拥有；描述插件向 App 提供什么以及如何集成
    → 注册后同步到 App 的 `.agents/skills/`

Registry canonical source
└── registry/**
    → 插件发布；materialize 后的副本归 App
```

不要在 App 中直接修改同步自插件的 `.agents/skills/nocobase-app-plugin-*`；下一次同步会覆盖它。不要把 materialized Registry 源码误认为插件运行时 Client 源码。

## Plugin Skills 应该描述什么

Plugin Skills 的读者是使用插件能力的 App Agent，不是维护插件源码的开发 Agent。应按 App 任务描述：

- Client 组件、hooks、factories、routes 和 options；
- Server exports、ServiceToken、ServiceProvider、Route factories 和公开服务；
- App 需要先具备的数据模型、字段或关系；
- 与业务模块组合的集成流程；
- 页面、Settings、公共 API、权限和所有权边界；
- Registry 可安装项及其归属；
- 验证步骤、诊断方式和已知限制。

不要把 Plugin Skill 主要写成插件源码修改教程、私有实现说明、未导出 API、绕过公共服务直接读内部表的做法、通用仓库规则或历史设计提案。

## Client 文件

| 文件                                       | 权威职责                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `client/index.ts`                          | `./client` 包入口；default 重新导出 Client plugin factory              |
| `client/plugin.ts`                         | 声明包名、Client options 和 `bootstrap`、`routes`、`providers` loaders |
| `client/bootstrap.ts`                      | 命令式初始化 Refine resources 或 providers                             |
| `client/routes.ts`                         | 通过 `defineAppRoutes()` 和 `defineSettingsRoutes()` 声明页面          |
| `client/providers.ts`                      | 通过 `defineClientProviders()` 声明 React Providers                    |
| `client/pages/`                            | 由 `componentLoader` 按需加载的页面组件                                |
| `client/contexts.ts` 或 `client/contexts/` | Context 和 hooks                                                       |
| `client/components/`                       | 插件拥有的 runtime UI 组件                                             |
| `client/styles.css`                        | 插件 UI 生成入口；只有实际需要时保留                                   |

Client 只有三个 contribution entries：

```text
bootstrap
routes
providers
```

Settings 属于 `routes`，不存在独立 `client/settings.ts` 契约。

开始 Client 任务时，按顺序检查：

```text
package.json
→ client/index.ts
→ client/plugin.ts
→ client/bootstrap.ts / client/routes.ts / client/providers.ts
→ tests/
→ <target-app>/client/plugins.ts
```

## Server 文件

| 文件                | 权威职责                                                |
| ------------------- | ------------------------------------------------------- |
| `server/plugin.ts`  | 组合 Providers、Routes、Database 和 Queue contributions |
| `server/services/`  | 不依赖 HTTP 边界的领域行为默认实现                      |
| `server/tokens.ts`  | 稳定服务接口和 ServiceToken                             |
| `server/providers/` | 服务注册和生命周期                                      |
| `server/routes/`    | API 和 Root Route contributions                         |
| `server/jobs/`      | Queue Job definitions                                   |

推荐职责链：

```text
Route
→ app.container.resolve(ServiceToken)
→ Service implementation
```

`server/plugin.ts` 只组合 contributions，不应包含大量业务实现。Server Routes 是直接 contributions，不通过 loader 加载。

开始 Server 任务时，按顺序检查：

```text
package.json
→ server/plugin.ts
→ server/providers/index.ts
→ server/tokens.ts
→ server/routes/index.ts
→ tests/
→ <target-app>/server/plugins.ts
```

## Database 文件

| 路径                   | 职责                               |
| ---------------------- | ---------------------------------- |
| `database/migrations/` | 不可变、显式、自包含的 schema 历史 |
| `database/seeds/`      | 初始或开发所需数据                 |
| `database/README.md`   | 生成插件的启用说明                 |

脚手架示例以 `.ts.example` 结尾，因此不会被加载。启用一个示例时，只移除最后的 `.example`，并确保文件名与导出的 `name` 一致。

编辑已有 Migration 前必须检查其 Git 历史和引入分支是否已经合并。已合并的 Migration 不再修改，后续变化使用新 Migration。

开始 Database 任务时，按顺序检查：

```text
server/plugin.ts
→ database/README.md
→ database/migrations/
→ database/seeds/
→ tests/database.test.ts
→ related migration Git history
```

## `package.json`

`package.json` 同时承担开发、运行和发布契约：

- `name`、`version`、`displayName`、`description`；
- `exports`：source workspace 中使用的开发入口；
- `publishConfig.exports`：npm tarball 中指向 `dist` 的发布入口；
- `files`：进入发布包的内容；
- `nocobase`：插件管理和 Registry metadata；
- `dependencies`、`peerDependencies`、`devDependencies`；
- lint、typecheck、test、build 和 check scripts。

运行时注册只根据实际导出判断：

```text
exports["./client"]
→ 插件提供 Client 能力

exports["./server/plugin"]
→ 插件提供 Server 能力
```

删除整个 Client 或 Server 能力时，必须同时更新 source exports 和 `publishConfig.exports`，不能只删除源码目录。

## 必需契约与生成示例

### 必需契约

- 合法且不冲突的 npm package name；
- `0.0.1` 起始版本和 `publishConfig.access: public`；
- `files` 和发布 metadata；
- 使用到的 Client/Server exports；
- 与 exports 一致的插件声明；
- `@nocobase/dev-config` 配置；
- package-root `tests/`；
- `CHANGELOG.md`；
- 对修改包执行 lint、typecheck、test 和 build。

### 可删除的默认示例

- 示例 Refine resource；
- 示例普通页面和 Settings 页面；
- 示例 React Provider 和 Context；
- 示例 Service、Token、Provider 和 API Route；
- `.ts.example` Migration 和 Seed；
- Queue jobs 的空目录约定；
- Registry example；
- Starter App Skill 中的示例能力。

删除示例时不要留下失效声明。检查：

```text
source file
→ plugin declaration
→ package export
→ package dependency
→ package files/scripts
→ tests
→ README
→ App Skill
```

## 常见插件形态

| 插件形态              | 保留的主要能力                        |
| --------------------- | ------------------------------------- |
| 纯 Client 插件        | `client/` 和 `./client` export        |
| 纯 Server 插件        | `server/` 和 `./server/plugin` export |
| 全栈插件              | `client/`、`server/` 和两类 exports   |
| 数据插件              | Server + `database/`                  |
| Queue 插件            | Server + `server/jobs/`               |
| 带 App 集成知识的插件 | 真实能力 + 持续维护的 `skills/`       |
| Registry 插件         | 可选的 `registry/` canonical source   |

## 相关内容

- [创建并接入插件](./quick-start.md)
- [声明 Client 和 Server 插件](./plugin-declaration.md)
- [安装和注册插件](./plugin-registration.md)
