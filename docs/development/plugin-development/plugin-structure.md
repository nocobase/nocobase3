---
title: 插件结构和文件所有权
description: 识别 capability-driven NocoBase 插件中 Client、Server、Database、Queue、Skills、Registry、测试和发布文件的职责与生成条件。
---

# 插件结构和文件所有权

Create Plugin 生成一个可发布的 workspace package。Agent 不应根据目录名猜测运行时能力，而应结合 `package.json` exports、Client/Server 插件声明和目标 App composition roots 判断真实状态。

## Capability 目录并集

下面是所有 capability 的目录并集，不是每次创建都会出现的固定结构。
`plugin:create` 只生成通过 `--with` 显式选择的能力及其必要的 Client/Server
composition entry；只创建 package foundation 时使用 `--empty`。

```text
packages/app-plugin-audit-log/
├── client/
│   ├── components/
│   ├── pages/
│   ├── contexts.ts
│   ├── index.ts
│   ├── locales/
│   ├── plugin.ts
│   ├── providers/
│   ├── react-providers/
│   ├── routes.ts
│   └── styles.css
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── README.md
├── registry/
├── server/
│   ├── providers/
│   ├── locales/
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

`server/jobs/`、`registry/`、`database/`、`skills/` 和各个 Client/Server 文件都由
对应 capability 决定是否生成。选择 `server.routes` 不会顺带生成 ServiceProviders、
Database、Client 或 Skills；选择 `client.routes` 不会顺带生成页面、Settings 页面、
ServiceProvider 或 React Provider。选择 `database` 时 migrations 和 seeds 作为一个 capability
一起生成，其中 `.ts.example` 文件默认不执行。

Locale resources 也必须显式选择：`client.locales` 只生成 Client locale resources 和必要的 Client plugin entry，`server.locales` 只生成 Server locale resources 和必要的 Server plugin entry。选择 routes、service-providers 或 react-providers 不会顺带生成 locales。

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

| 文件                                       | 权威职责                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `client/index.ts`                          | `./client` 包入口；default 重新导出 Client plugin factory                           |
| `client/plugin.ts`                         | 静态声明包名、config、options、ServiceProviders、React Providers、Routes 和 locales |
| `client/locales/`                          | Client namespace 的 lazy locale resources                                           |
| `client/providers/`                        | Client ServiceProvider 实现和 constructor 数组                                      |
| `client/react-providers/`                  | 通过 `defineClientReactProviders()` 声明 React tree Providers                       |
| `client/routes.ts`                         | 通过 `defineAppRoutes()` 和 `defineSettingsRoutes()` 声明页面                       |
| `client/pages/`                            | 由 `componentLoader` 按需加载的页面组件                                             |
| `client/contexts.ts` 或 `client/contexts/` | Context 和 hooks                                                                    |
| `client/components/`                       | 插件拥有的 runtime UI 组件                                                          |
| `client/styles.css`                        | 插件 UI 生成入口；只有实际需要时保留                                                |

Client 的基础静态声明包括：

```text
config
serviceProviders
reactProviders
routes
locales
```

Settings 属于 `routes`，不存在独立 `client/settings.ts` 契约。

开始 Client 任务时，按顺序检查：

```text
package.json
→ client/index.ts
→ client/plugin.ts
→ client/providers/index.ts / client/react-providers/index.ts / client/routes.ts / client/locales/index.ts
→ tests/
→ <target-app>/client/plugins.ts
```

## Server 文件

| 文件                | 权威职责                                                           |
| ------------------- | ------------------------------------------------------------------ |
| `server/index.ts`   | 公开导出 Server plugin definition                                  |
| `server/plugin.ts`  | 组合 ServiceProviders、Routes、Database、Queue 和 locale resources |
| `server/locales/`   | Server namespace 的 lazy locale resources                          |
| `server/services/`  | 不依赖 HTTP 边界的领域行为默认实现                                 |
| `server/tokens.ts`  | 稳定服务接口和 ServiceToken                                        |
| `server/providers/` | 服务注册和生命周期                                                 |
| `server/routes/`    | API 和 Root Route contributions                                    |
| `server/jobs/`      | Queue Job definitions                                              |

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
→ server/index.ts
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
server/index.ts
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

`plugin:create` 按实际 runtime capability 选择 `@nocobase/dev-config`：纯 Browser
library 使用 `client-library`，纯 Server library 使用 `server-library`，全栈 library
使用 `server-library` 并在本地增加 DOM/JSX。只有包含 Server runtime 的插件才声明
Node engine；不要因为 Browser 插件的构建工具运行于 Node 就给它添加 Node runtime 要求。

运行时注册只根据实际导出判断：

```text
exports["./client"]
→ 插件提供 Client 能力

exports["./server"]
→ 插件提供 Server 能力
```

删除整个 Client 或 Server 能力时，必须同时更新 source exports 和 `publishConfig.exports`，不能只删除源码目录。

## 必需契约与 capability 骨架

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

生成器不再创建需要事后批量裁剪的完整业务示例。各 capability 提供最小、可检查的
结构骨架：

- `client.routes` 和 `server.routes` 从空 contributions 开始，由 Agent 添加真实 Route；
- `server.service-providers` 提供 ServiceProvider、Service 和 Token 结构；
- `client.service-providers` 提供 Client Provider constructors 和生命周期测试；
- `client.react-providers` 提供 React Context、Wrapper declaration 和行为测试；
- `database` 提供 disabled Migration/Seed examples；
- `server.jobs` 提供最小 Job 结构和测试；
- `client.locales`、`server.locales` 分别提供独立的 lazy locale resource 骨架；
- `registry` 提供 Registry 构建、发布和所有权链路；
- `skills` 提供 development draft，注册前必须改成真实 App-facing 契约。

实现业务或移除已选择的 capability 时，不要留下失效声明。检查：

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

| 插件形态              | 保留的主要能力                      |
| --------------------- | ----------------------------------- |
| 纯 Client 插件        | `client/` 和 `./client` export      |
| 纯 Server 插件        | `server/` 和 `./server` export      |
| 全栈插件              | `client/`、`server/` 和两类 exports |
| 数据插件              | Server + `database/`                |
| Queue 插件            | Server + `server/jobs/`             |
| 带 App 集成知识的插件 | 真实能力 + 持续维护的 `skills/`     |
| Registry 插件         | 可选的 `registry/` canonical source |

## 相关内容

- [创建并接入插件](./quick-start.md)
- [声明 Client 和 Server 插件](./plugin-declaration.md)
- [安装和注册插件](./plugin-registration.md)
