---
title: '准备'
description: '了解使用 Agent 开发工作流的分工，准备应用、工作流插件、Skill 和开发环境。'
keywords: 'NocoBase,工作流,Agent,Skill,开发准备'
---

# 准备

推荐通过应用 Agent 编写工作流：你描述业务目标、确认方案和风险、验收运行证据；Agent 检查当前应用，实现工作流和业务代码，并执行验证。管理界面用于启停、配置参数和查看运行，不提供流程结构编辑器。

这里的“应用 Agent”指在应用目录中工作的编码 Agent，例如 Claude Code 或 Codex。你不需要先学会 DSL，先把业务和预期结果说清楚即可。

## 开始前需要准备什么

| 准备项             | 要求                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| NocoBase 3 应用    | 已创建应用，并能够安装依赖；还没有应用时，参见[创建应用](../../../get-started/create-app.md) |
| 工作流插件         | 已安装并注册 `@nocobase/app-plugin-workflow`，应用模板默认包含                               |
| 应用 Agent         | 已使用编码 Agent 打开应用目录，使其能够读取应用代码和项目指导                                |
| 工作流 Skill       | 应用的 `.agents/skills/` 中包含 `nocobase-app-plugin-workflow`                               |
| 开发环境           | 使用 `pnpm dev` 启动应用，能够以管理员身份登录并进入“设置 → 自动化 → 工作流”                 |
| 业务需求与测试数据 | 明确触发事件、业务规则、可调配置和副作用；准备可识别、可清理的测试数据                       |

不要直接在生产环境中试跑开发中的工作流。手动运行会执行真实业务代码，可能写库或调用外部系统。

## 准备工作流 Skill

工作流插件随包发布的 Skill `nocobase-app-plugin-workflow` 提供当前安装版本的开发步骤、节点用法和检查指导。它会同步到应用的 `.agents/skills/`；缺失或安装、升级插件后需要更新时，在应用根目录运行：

```bash
pnpm nocobase skills sync
```

确认 `.agents/skills/nocobase-app-plugin-workflow/SKILL.md` 存在，并让 Agent 读取它。`.agents/skills/` 是生成内容，下一次同步会整体替换，不要直接修改。通常不必在每条需求中点名 Skill；需要明确开发方式时，可以说“请使用工作流 Skill 分析当前应用”。

## 理解三个基本概念

1. 应用 `workflows/` 下的一个目录就是一个工作流包，目录名是触发时使用的稳定 key；
2. 每个被接受的新业务事件产生一条运行记录，固定关联开始时的工作流版本；重复 eventKey 不会产生新运行；
3. 工作流负责编排业务阶段和路径，具体的数据操作、事务和外部集成由处理函数调用应用 Service 完成。

## 接下来怎么做

- [开发流程](./process.md)：按描述需求、判断选型、确认方案、实现、试跑和接入触发推进，每一步都包含可交给 Agent 的示例和验收要求；
- [检查、构建与发布](./verification-and-diagnostics.md)：完成验证、构建与部署，再由管理员启用新版本；
- [快速开始](../quick-start.md)：运行现成的报价示例，先体验分支路径、节点结果和执行记录。

需要审阅代码时，查阅[工作流定义 DSL](../reference/dsl.md)、[节点](../reference/nodes/index.md)和[触发工作流](../reference/service-api.md)。日常操作和异常诊断见[管理工作流](../management/index.md)。
