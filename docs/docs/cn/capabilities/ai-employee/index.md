---
title: 'AI 员工'
description: '了解 NocoBase AI 员工的模型、员工、Skill、Tool、MCP、聊天组件和服务端运行时。'
keywords: 'NocoBase,AI 员工,LLM,Agent,Skill,Tool,MCP'
---

# AI 员工

在 NocoBase 中，**AI 员工（AI Employee）** 是一类可以围绕具体职责持续工作的 Agent。一个 AI 员工由角色设定、LLM、Skill 和 Tool 共同组成：角色设定说明它是谁、怎样回答；LLM 负责理解和生成；Skill 提供完成任务的方法；Tool 让它读取业务数据或执行操作。

AI 员工并不局限于一个聊天窗口。你可以把完整对话放在独立页面或业务区块里，也可以把入口放在应用右下角、记录操作区或表单旁边。页面还可以把当前记录、表单和局部操作作为上下文交给 AI 员工，让对话和正在处理的业务保持一致。

## 从哪里开始

| 我想要……                                       | 去哪里看                                    |
| ---------------------------------------------- | ------------------------------------------- |
| 配置一个模型，并在应用里打开第一次对话         | [快速开始](./quick-start.md)                |
| 定义自己的员工、Tool、Skill 或 MCP 服务        | [定义 AI 员工](./development/index.md)      |
| 在页面中加入聊天入口、任务、上下文或 Tool 卡片 | [使用 AI 组件](./components/index.md)       |
| 查询 `config.yml` 中 AI 配置项的完整写法       | [配置参考](./configuration/index.md)        |
| 在管理后台维护员工、模型和 MCP Tool 权限       | [管理 AI 服务](./management/index.md)       |
| 从服务端直接创建和运行 Agent                   | [扩展服务端 AI 服务](./server-extension.md) |

## 先分清三类扩展

AI 员工相关内容分别属于应用源码、应用配置和管理后台。三者解决的问题不同。

| 位置                                                  | 适合放什么                                                            | 何时生效                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------- |
| `server/ai/`、`ai/`、`client/extensions/nocobase-ai/` | 员工定义、后端 Tool、Skill、MCP 模块和前端组件                        | 修改 TypeScript 或静态资源后重启开发服务      |
| `config.yml`                                          | LLM 连接、MCP 连接、附件存储和额外 Skill 目录                         | AI 配置支持重载；快速开始统一通过重启服务生效 |
| 「AI Employee」管理页                                 | 员工启用状态、角色设定、可用模型、Skill、Tool、知识库和 MCP Tool 权限 | 保存后生效                                    |

应用运行时只有一个由 AI 员工插件注册的 `AIManager`。应用资源应接入这个实例，不要另外调用 `createAIManager()` 建一套平行运行时。普通前端对话使用插件提供的 `nocobase-ai` Registry 安装副本；安装后由其中的 Service 和 Transport 处理会话、文件上传、流式响应、Tool 审批和断线恢复。

## 应用中的目录

下面是和 AI 员工扩展直接相关的目录。

```text
config.yml
server/
├── ai/
│   ├── employees/          # 应用自己的 AI 员工
│   ├── tools/              # 应用级后端 Tool
│   └── index.ts            # 静态聚合并注册 Employee 和 Tool
└── providers/              # 把应用 AI 资源接入运行时
ai/
├── skills/<name>/SKILL.md  # Skill 及其可选局部 Tool
└── mcp/                    # 用代码定义的 MCP 服务
client/
└── extensions/nocobase-ai/ # 应用拥有的 AI 前端 Registry 源码
```

Employee 和 Tool 通过静态 import 注册。Skill 使用 `SkillsLoader` 从 `SKILL.md` 加载，MCP 可以通过 `config.yml` 声明，也可以由 `MCPLoader` 从 `ai/mcp` 加载。运行时按 Tool、MCP、Skill、Employee 的顺序准备资源，这样员工注册时引用的能力已经存在。

## 相关链接

- [快速开始](./quick-start.md) — 配置 LLM 并创建全局对话入口
- [定义 AI 员工](./development/index.md) — 注册 Employee、Tool、Skill 和 MCP 服务
- [使用 AI 组件](./components/index.md) — 将 AI 对话接入应用页面
- [配置参考](./configuration/index.md) — 查看 `config.yml` 的 AI 配置项
- [管理 AI 服务](./management/index.md) — 使用管理页调整运行状态
- [扩展服务端 AI 服务](./server-extension.md) — 在服务端直接调用 Agent
