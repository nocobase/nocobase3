---
title: 'AI 员工管理'
description: '在设置页启用 AI 员工并维护角色、模型、Skill、Tool 和知识库。'
keywords: 'AI Employee,Role settings,Model settings,Skills,Tools,Knowledge Base'
---

# AI 员工管理

在 `/settings/ai` 的「AI Employee」Tab 中，左侧显示已经注册的员工，右侧显示当前员工的配置。绿色状态点和顶部 Enabled 开关表示员工是否可用。

![AI 员工管理](https://static-docs.nocobase.com/20260914111142-ai-employee-settings.png)

## Profile

Profile 显示 `Username`、`Nickname`、`Position`、`Bio` 和 `Greeting`。这些字段来自员工源码定义，在管理页中只读。需要修改员工身份或展示信息时，修改 `defineAIEmployee()` 并重启应用。

## Role settings

内置员工可以在「System default」和「Custom」之间切换；自定义员工直接编辑角色内容。角色设定应说明员工职责、可以依据哪些事实、何时询问用户以及哪些行为禁止执行。

修改角色设定不会给员工增加数据权限。员工能否读写业务数据仍由当前用户权限和 Tool 的服务端检查决定。

## Model settings

开启「Enable dedicated model configuration」后，可以限制这个员工使用哪些 `{ llmService, model }`。列表只包含已启用 LLM 服务开放的模型。关闭专用配置后，员工使用当前运行时允许的通用模型集合。

## Skills

Skill 按 Scope 分成三组：

| 分组                     | 管理方式                     |
| ------------------------ | ---------------------------- |
| General skills           | 所有员工共享，只读展示       |
| Employee-specific skills | 源码绑定给这个员工，只读展示 |
| Custom skills            | 管理员可以为员工添加或移除   |

管理页只能选择已经由 `SkillsLoader` 加载的 Skill，不能在这里创建或编辑 `SKILL.md`。

## Tools

Tool 同样分成 General、Employee-specific 和 Custom。General 和 Employee-specific Tool 展示当前权限；Custom Tool 可以添加、移除，并在 `Ask` 与 `Allow` 之间切换。

`Allow` 只表示运行时不再要求这一步人工确认，不代表跳过 Tool 自己的 ACL、参数校验或业务约束。对写入和外部副作用操作保持 `Ask`。

## Knowledge Base

启用知识库后，可以选择一个或多个当前已启用的知识库，选择按需检索或每个问题都检索，并设置提示词、Top K 和最低相似度 Score。提示词必须包含 `{knowledgeBaseData}` 占位符。

用户实际检索范围仍受其角色能访问的知识库限制。员工配置中选中了知识库，不会提升使用者权限。

## 保存和切换

修改后页面底部出现 Save 与 Cancel。存在未保存内容时切换员工会弹出确认，不会静默丢弃修改。保存失败时保留当前草稿，先处理错误再重试。

## 相关链接

- [注册 AI 员工](../development/employee.md) — 修改员工源码定义
- [注册 Skill](../development/skill.md) — 创建可选择的 Skill
- [注册 Tool](../development/tool.md) — 创建可选择的 Tool
- [LLM 服务管理](./llm-services.md) — 准备员工可用模型
