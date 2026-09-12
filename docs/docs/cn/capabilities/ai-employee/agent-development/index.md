---
title: '使用 Agent 开发 AI 员工功能'
description: '使用 nocobase-plugin-ai-employee 技能，让 Agent 声明 AI 员工、添加技能和工具，并集成前端聊天。'
keywords: 'Agent,AI 员工,nocobase-plugin-ai-employee,ai/tools,ai/skills'
---

# 使用 Agent 开发

NocoBase AI 员工插件配套 `nocobase-plugin-ai-employee` 技能。你可以把业务目标交给 Agent，让它检查应用结构，并在正确的目录添加员工、技能、工具和前端集成。

大部分开发任务可以按下面的顺序描述：

1. 说明员工要解决的业务问题
2. 指定执行位置——后端工具、前端工具或普通聊天
3. 指定权限——是否需要用户确认
4. 指定要修改的目录
5. 要求 Agent 运行检查并报告验证结果

## 让 Agent 开始工作

开发任务中需要说明业务目标、资源目录、执行位置、权限和验证方式。Agent 会根据当前应用已有的 `nocobase-plugin-ai-employee` 技能选择员工、技能、工具或前端 Registry 的扩展点。

可以把任务拆成以下几部分：

- 员工角色和职责
- 技能需要遵循的业务规则
- 工具读取或修改的数据范围
- 前端需要出现的聊天或快捷入口
- 哪些操作必须经过用户确认
- 需要运行的检查和测试

:::tip 目录名说明
资源加载约定使用 `ai/employees/`（复数）。如果任务描述使用单数目录名，Agent 应该根据当前项目的 `nocobase-plugin-ai-employee` 技能和已有目录结构选择正确路径，不要凭空创建第二套目录。

:::

## 四种开发能力

| 需求                         | 推荐做法                       |
| ---------------------------- | ------------------------------ |
| 让员工理解一个业务角色       | 在 `ai/employees/` 添加员工    |
| 让员工遵循一组稳定的业务知识 | 在 `ai/skills/` 添加技能       |
| 让员工查询或操作应用数据     | 在 `ai/tools/` 添加工具        |
| 让用户在页面中和员工对话     | 使用 Registry 的聊天和员工组件 |

## 相关页面

- [添加员工、技能和工具](./resources.md) — 目录和资源示例
- [在前端使用 AI 员工](./frontend.md) — 聊天组件和开发页面
- [扩展 AgentService](./runtime.md) — 服务端直接调用和扩展点
