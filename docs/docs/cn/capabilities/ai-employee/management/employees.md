---
title: 'AI 员工管理'
description: '在设置页启用 AI 员工并维护角色、模型、Skill、Tool 和知识库。'
keywords: 'AI Employee,Role settings,Model settings,Skills,Tools,Knowledge Base'
---

# AI 员工管理

设置页侧栏「AI」分组中的「AI 员工」页（`/settings/ai`）左侧显示已经注册的员工，右侧按 Profile、Role settings、Model settings、Skills、Tools 和 Knowledge Base 几个标签页显示当前员工的配置。绿色状态点和顶部 Enabled 开关表示员工是否可用。

![AI 员工管理](https://static-docs.nocobase.com/20260914111142-ai-employee-settings.png)

## Profile

Profile 显示 `Username`、`Nickname`、`Position`、`Bio` 和 `Greeting`。这些字段来自员工源码定义，在管理页中只读。需要修改员工身份或展示信息时，修改 `defineAIEmployee()` 并重启应用。

## Role settings

内置员工可以在「System default」和「Custom」之间切换；自定义员工直接编辑角色内容。角色设定应说明员工职责、可以依据哪些事实、何时询问用户以及哪些行为禁止执行。

修改角色设定不会给员工增加数据权限。员工能否读写业务数据仍由当前用户权限和 Tool 的服务端检查决定。

## Model settings

开启「Enable dedicated model configuration」后，可以限制这个员工使用哪些 `{ llmService, model }`。列表只包含已启用 LLM 服务开放的模型。关闭专用配置后，员工使用当前运行时允许的通用模型集合。

开启后，和这个员工对话时，聊天框的模型选择器只列出这里选中、并且当前仍启用的模型，顺序与这里一致，默认选中第一个；服务端也只会用这些模型运行。选中的模型如果都已经停用（所在的 LLM 服务被关闭，或模型被移出服务的模型列表），聊天框不列出任何模型、无法发送，服务端也会拒绝为这个员工运行，不会改用别的模型。所以停用模型后记得回来调整这个列表。

## Skills

Skills 标签页是一个平铺列表，列出 `SkillsLoader` 已经加载的全部 Skill，每一项显示标题、名称和描述，右侧的开关决定这个员工能不能加载它。

还没有调整过时，默认打开的是 Scope 为 `GENERAL` 的 Skill，以及员工源码定义 `skills` 中列出的 Skill。关掉的 Skill 这个员工在对话中加载不到。和 Tools 一样，改过开关并保存之后，这个员工的 Skill 就固定成保存时的名单，之后新加载的 Skill 需要回到这里手动打开。

管理页只能开关已经加载的 Skill，不能在这里创建或编辑 `SKILL.md`。

## Tools

Tools 标签页同样是一个平铺列表，列出已经注册的全部 Tool，包括 MCP 服务发现的 Tool。每一项显示标题、注册名和介绍，右侧有权限标识和使用开关。

还没有调整过时，默认打开的是 Scope 为 `GENERAL` 的 Tool、`getSkill` 等可选的系统 Tool、员工源码定义 `tools` 中列出的 Tool，以及已开启 Skill 点名的 Tool。开关打开只表示这个员工可以用它：被 Skill 点名的 Tool 仍要等会话加载那个 Skill 才可用，网页搜索、知识库检索这类可选 Tool 仍要开启对应的能力。关掉的 Tool，这个员工在任何会话中都用不到。

只要改过开关并保存，这个员工的 Tool 就固定成保存时的名单。之后新注册的 Tool 或新发现的 MCP Tool 不会自动加入，需要回到这里手动打开。

权限标识的行为取决于 Tool 的 Scope：

| Tool 的 Scope          | 权限标识                                                 |
| ---------------------- | -------------------------------------------------------- |
| `CUSTOM`               | 可以在 `Ask` 和 `Allow` 之间切换，打开使用开关后才可编辑 |
| `GENERAL`、`SPECIFIED` | 只读显示 Tool 注册时的默认权限，不能在这里修改           |

`Allow` 只表示运行时不再要求这一步人工确认，不代表跳过 Tool 自己的 ACL、参数校验或业务约束。对写入和外部副作用操作保持 `Ask`。MCP Tool 的权限在「MCP 服务」页调整，见 [MCP 服务管理](./mcp-services.md)。

管理页只能开关已经注册的 Tool，不能在这里创建或编辑 Tool 实现。

## Knowledge Base

Knowledge Base 标签页为这个员工开启知识库检索，并设置检索哪些知识库、检索策略（按需检索或每次提问前自动检索）、知识库提示词、`Top K` 和 `Score`。知识库提示词必须包含 `{knowledgeBaseData}` 占位符。

知识库检索需要安装并启用 AI 知识库插件，还要先配置好向量数据库和 Embedding 服务。没有这个插件时，这里的设置不会产生检索结果。各项设置的含义见 [AI 员工 RAG 检索](../../ai-knowledge-base/quick-start/agent-rag.md)。

## 相关链接

- [注册 AI 员工](../development/employee.md) — 修改员工源码定义
- [注册 Skill](../development/skill.md) — 创建可选择的 Skill
- [注册 Tool](../development/tool.md) — 创建可选择的 Tool
- [LLM 服务管理](./llm-services.md) — 准备员工可用模型
- [MCP 服务管理](./mcp-services.md) — 调整 MCP Tool 权限
- [AI 员工 RAG 检索](../../ai-knowledge-base/quick-start/agent-rag.md) — 配置员工的知识库检索
