---
title: 描述插件提供给 App 的能力
description: 在插件顶层 skills 目录描述插件向 App 提供的公共能力、集成流程、所有权边界、权限、约束和验证方式，并同步到 App 的 .agents/skills 供 App Agent 使用。
---

# 描述插件提供给 App 的能力

只有创建插件时显式选择 `--with skills` 才会生成 `skills/`。生成的 `SKILL.md`
是 development draft，不代表插件已经提供其中描述的页面、API 或 Service。注册插件
前必须把 draft 替换为真实的 App-facing 能力、集成流程、权限、约束和验证步骤。

本指南由开发插件的 Agent 阅读，用来编写供 App Agent 使用的 Plugin Skills。插件开发文档回答“如何修改插件源码”；Plugin Skills 回答“插件向 App 提供了什么，以及 App 如何集成和使用”。

## Plugin Skills 的职责和读者

```text
<plugin>/skills/       插件拥有的源文件
        ↓ synchronize
<app>/.agents/skills/  App Agent 读取的副本
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

## 描述权限、约束和验证

明确调用身份、resource/action、必要 scopes、数据边界、幂等性、重试、容量或生命周期限制。验证应指出可观察结果，例如响应、页面状态、记录、队列状态或日志；不要只写“运行测试”。

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

`package.json#files` 必须包含 `skills`。注册默认同步；也可执行：

```bash
pnpm plugin:skills:sync --app <target-app> --plugin <plugin-name>
```

每个目录整体替换，源文件删除的 Skill 会从 App 清理，名称冲突会失败。`--disabled` 默认仍同步 Skills；只有显式 `--no-skills` 才跳过。不要编辑 App 中的同步副本。

## 插件能力变化时保持一致

当公共入口、集成步骤、输入输出、数据要求、权限、边界、约束或验证方式变化时，同一改动中更新 Skill。内部重构不影响 App 使用方式时无需更新。

## 完成条件

- Skill 面向 App Agent 的任务，而不是插件源码开发；
- 只引用真实公共能力，没有模板占位符或私有入口；
- 前置条件、所有权、权限、约束、验证和诊断完整；
- 目录命名、frontmatter、references 和 package `files` 正确；
- 源文件与实际插件能力语义一致；
- 同步在任务范围内时，App 副本与源文件一致。
