---
title: 'AI 员工'
description: '了解 NocoBase AI 员工插件的配置、开发和管理方式。'
keywords: 'NocoBase,AI 员工,LLM,Agent,AI 插件'
---

# AI 员工

在 NocoBase 中，**AI 员工（AI Employee）** 是一个可以使用模型、技能和工具完成工作的 Agent。你可以为应用配置 LLM，在源码中添加应用专属的 AI 员工，也可以在管理后台调整员工的启用状态、模型和能力。

这组文档围绕四个主题展开：

| 我想要……                                        | 去哪里看                                        |
| ----------------------------------------------- | ----------------------------------------------- |
| 先把 AI 员工跑起来                              | [快速开始](./quick-start/index.md)              |
| 配置 OpenAI、DeepSeek 等 LLM 服务               | [配置 LLM](./llm/index.md)                      |
| 让 Agent 声明员工、技能和工具，并把员工放进前端 | [使用 Agent 开发](./agent-development/index.md) |
| 在管理后台启用、配置和管理 AI 员工              | [管理 AI 员工](./management/index.md)           |

:::tip 先看哪一篇

如果你还没有配置模型，先阅读「[快速开始](./quick-start/index.md)」。如果你要让 Agent 直接修改应用源码，阅读「[使用 Agent 开发](./agent-development/index.md)」。

:::

## 能做什么

AI 员工插件提供几类能力：

- 通过 `config.yml` 声明 LLM 服务和可用模型
- 从应用的 `ai/` 目录加载 AI 员工、技能、工具和 MCP 配置
- 在管理后台统一管理模型和 AI 员工
- 通过 `@nocobase/app-plugin-ai-employee/registry/nocobase-ai` 提供聊天、员工快捷入口、页面上下文和前端工具组件
- 在服务端通过 `AIConversationsManager` 和 `AgentServiceFactory` 创建带持久化会话的 Agent

## 目录约定

应用源码中的 AI 资源放在应用根目录的 `ai/` 下：

```text
ai/
├── employees/<name>/index.ts   # AI 员工定义
├── employees/<name>/prompt.md  # 可选的长提示词
├── skills/<name>/SKILLS.md     # 自定义技能
├── skills/<name>/tools/        # 技能专属工具，可选
├── tools/<name>.ts             # 应用级后端工具
└── mcp/<name>.ts               # MCP 配置，可选
```

其中 AI 员工使用复数目录名 `ai/employees/`。员工的 `username` 是稳定标识，声明发布后不要随意修改。

## 相关链接

- [快速开始](./quick-start/index.md) — 配置模型并声明第一个 AI 员工
- [配置 LLM](./llm/index.md) — 管理 LLM 服务和可用模型
- [使用 Agent 开发](./agent-development/index.md) — 使用 Agent 扩展 AI 能力
- [管理 AI 员工](./management/index.md) — 在管理后台管理员工
