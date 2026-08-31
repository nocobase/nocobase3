---
title: 描述插件提供给 App 的能力
description: 在插件顶层 skills 目录描述插件向 App 提供的公共能力、集成流程、所有权边界、权限、约束和验证方式，并同步到 App 的 .agents/skills 供 App Agent 使用。
---

# 描述插件提供给 App 的能力

只有创建插件时显式选择 `--with skills` 才会生成 `skills/`。生成的 `SKILL.md`
是 development draft，不代表插件已经提供其中描述的页面、API 或 Service。注册插件
前必须把 draft 替换为真实的 App-facing 能力、集成流程、权限、约束和验证步骤。

本指南由开发插件的 Agent 阅读，用来编写供 App Agent 使用的 Plugin Skills。插件开发文档回答“如何修改插件源码”；Plugin Skills 回答“插件向 App 提供了什么，以及 App 如何集成和使用”。

仓库中的 `packages/app-plugin-skills-example` 是最小但完整的参考实现。它不是只放一份
`SKILL.md` 的空示例，而是同时提供可导入的 Client component、Server
`ServiceToken`、带自身认证边界的 API，以及在 `app-template-default` 中由 App 拥有的
页面组合和行为测试。开发新 Skill 时优先对照这个闭环，不要只对照 Markdown 结构。

## Plugin Skills 的职责和读者

```text
<plugin>/skills/       插件拥有的源文件
        ↓ synchronize
<app>/.agents/skills/  App Agent 读取的本地生成副本（不进入 Git）
```

Skill 不参与 Client 或 Server runtime enablement，也不是补充 README。只有插件提供了 App Agent 需要发现的公共能力或集成知识时才需要；纯内部插件可以不提供 Skill。

## 哪些能力需要描述

- 可导入的 Client components、hooks、factories 和 options；
- Server exports、ServiceTokens、Route factories 或公共 API；
- App 必须创建的数据模型、字段、关系和权限；
- 页面、Settings、工作流节点、Registry items 等可组合能力；
- 调用顺序、输入输出、所有权边界、限制、诊断和验证。

不要主要描述如何编辑插件源码、私有实现、未导出 API、直接操作内部表、通用仓库规则或历史设计过程。

## 按 App 任务组织能力

标题和章节使用 App Agent 会收到的任务，例如“为业务记录关联附件”“触发并诊断工作流”，而不是按 `client/`、`server/` 文件树复述源码。开头明确触发场景、能力边界和不要使用该 Skill 的场景。

## 说明所有权和公共入口

对每项能力写明：

```text
App owns       页面组合、业务 collection、权限配置、调用时机
Plugin owns    公共组件、Token、Route、内部数据和运行时行为
Public entry   package export、API path、factory、Registry item 或 UI entry
Do not bypass  私有模块、内部表、同步副本
```

入口必须是插件实际 export 或稳定公开的 surface。App Agent 不应从源码深层路径 import，也不应复制插件实现。

## 编写 App 集成工作流

把流程写成可执行的最短闭环：发现前置条件 → 配置 App 数据或权限 → 调用公共入口 → 验证结果 → 失败时诊断。示例应使用真实名称和输入，避免模板占位符。

## 区分 package export 与 Client runtime contribution

可复用 component 的公开 subpath export 不等于 `exports["./client"]`。例如 Skills
Example 公开：

```text
@nocobase/app-plugin-skills-example/client/components/app-notice
```

App 可以直接在自己拥有的页面中导入并组合它；插件没有 `./client`，因此 App 不应为了
使用这个组件而新增 Client plugin registration。只有插件实际提供 config、serviceProviders、reactProviders、routes 或
locales contribution 时，才通过 `./client` 注册 Client plugin。Skill 必须把这两类入口
写清楚，避免 Agent 根据 `client/` 文件路径猜测 runtime composition。

同一个示例的 Server API `GET /api/skills-example/notice` 要求已登录，但对固定、非敏感
示例数据没有额外业务授权。这里需要同时写出“有 authentication”和“为什么没有额外
authorization”；如果响应改为私有或用户相关数据，必须重新设计权限边界并更新 Skill。

## 描述权限、约束和验证

明确调用身份、resource/action、必要 scopes、数据边界、幂等性、重试、容量或生命周期限制。验证应指出可观察结果，例如响应、页面状态、记录、队列状态或日志；不要只写“运行测试”。

不要把 `plugin:inspect`、`client:inspect` 或 `server:inspect` 写成 App Agent 使用插件的主流程或能力正确性的证明。正常工作流先调用插件的公共入口，再验证用户可观察的页面、响应、数据或任务结果。只有插件能力意外不可用、需要排查登记或 composition 时，才在 diagnostics 中把 Inspector 作为只读辅助工具；即使结果为 `consistent: true`，也不能代替真实行为验证。

## 主 `SKILL.md` 与 references

主文件保持任务路由和最短工作流，细节放入 `references/`：

```text
skills/nocobase-app-plugin-audit-log/
├── SKILL.md
└── references/
    ├── data-model.md
    ├── api.md
    └── diagnostics.md
```

主文件必须有准确的 `name` 和 `description` frontmatter，并明确何时触发。references 从 `SKILL.md` 直接链接，避免多层跳转。

## 一个插件提供多个 Skills

一个插件可按独立 App 任务拆分多个 Skills。目录名必须等于插件拥有的前缀或以该前缀加 `-<suffix>` 开头，例如：

```text
nocobase-app-plugin-workflow
nocobase-app-plugin-workflow-diagnostics
```

不要按源码子目录机械拆分，也不要与其他插件声明同名 Skill。

## 发布和同步到 App

`package.json#files` 必须包含 `skills`。注册默认同步；也可以进目标 App 目录单独执行：

```bash
pnpm plugin:skills:sync --plugin <plugin-name>
```

每个目录整体替换，源文件删除的 Skill 会从 App 清理，名称冲突会失败。`--disabled` 默认仍同步 Skills；只有显式 `--no-skills` 才跳过。不要编辑 App 中的同步副本。

目标 App 的整个 `.agents/` 是本地同步产物，必须被 `.gitignore` 排除，也不进入 App
模板的发布包。应提交插件拥有的 `<plugin>/skills/` 源文件，以及 App Agent 根据 Skill
修改的正式 Client、Server、Database 或 Registry 源码；不要提交同步后的副本，也不要把
App 自己需要长期维护的 Skill 源文件直接放进这个生成目录。

## 插件能力变化时保持一致

当公共入口、集成步骤、输入输出、数据要求、权限、边界、约束或验证方式变化时，同一改动中更新 Skill。内部重构不影响 App 使用方式时无需更新。

## 完成条件

- Skill 面向 App Agent 的任务，而不是插件源码开发；
- 只引用真实公共能力，没有模板占位符或私有入口；
- 前置条件、所有权、权限、约束、验证和诊断完整；
- 目录命名、frontmatter、references 和 package `files` 正确；
- 源文件与实际插件能力语义一致；
- 同步在任务范围内时，App 副本与源文件一致。
