---
title: '注册 AI 员工'
description: '使用 defineAIEmployee 定义应用自己的 AI 员工，并通过 AIResourceRegistrar 注册。'
keywords: 'defineAIEmployee,AI Employee,username,systemPrompt,AIResourceRegistrar'
---

# 注册 AI 员工

AI 员工的 TypeScript 定义负责稳定身份、展示信息、默认角色设定以及 Skill 和 Tool 的初始绑定。管理后台可以在此基础上调整启用状态和用户可编辑配置，不过 `username` 和源码拥有的基础定义仍应保持稳定。

## 创建员工定义

在 `server/ai/employees/customer-success/index.ts` 中默认导出 `defineAIEmployee()` 的结果：

```ts
import { defineAIEmployee } from '@nocobase/ai-employee';

export default defineAIEmployee({
  username: 'customer-success',
  category: 'business',
  nickname: 'Customer Success',
  position: 'Customer success specialist',
  description: 'Reviews customer context and prepares follow-up actions.',
  bio: 'I help account teams understand customer needs and plan the next step.',
  greeting: 'Share a customer record or ask me to prepare a follow-up.',
  systemPrompt: `You are a customer success specialist.
Use only the business context and Tools available in the current conversation.
Never invent customer facts, commitments, or dates.
Ask one precise question when required information is missing.`,
  skills: ['customer-follow-up'],
  tools: [{ name: 'find-customer', autoCall: false }],
  chatSettings: {
    systemPromptMode: 'default',
    enableSkills: true,
    enableTools: true,
  },
  sort: 100,
});
```

`username` 会被会话、任务、快捷入口和服务端调用保存下来。员工投入使用后，不要通过修改 `username` 来改名；只修改 `nickname` 或其他展示字段。

## 字段说明

| 字段           | 是否必填 | 说明                                            |
| -------------- | -------- | ----------------------------------------------- |
| `username`     | 是       | 员工的稳定唯一标识                              |
| `category`     | 否       | 员工分类，业务员工通常使用 `business`           |
| `description`  | 否       | 员工用途的简短说明                              |
| `avatar`       | 否       | 头像键或应用支持的 URL                          |
| `nickname`     | 否       | 界面显示名称                                    |
| `position`     | 否       | 职位或角色标签                                  |
| `bio`          | 否       | 员工介绍                                        |
| `greeting`     | 否       | 新会话空状态中的问候语                          |
| `systemPrompt` | 否       | 基础角色设定，可以是字符串、`null` 或省略       |
| `skills`       | 否       | 已注册 Skill 的名称数组                         |
| `tools`        | 否       | `{ name, autoCall? }` 数组，名称必须已经注册    |
| `chatSettings` | 否       | 控制系统提示词模式以及 Skill、Tool 是否参与对话 |
| `sort`         | 否       | 列表排序值                                      |

`chatSettings.systemPromptMode` 支持 `default`、`raw` 和 `none`。默认使用 `default` 就够了；只有需要完整替换或关闭默认系统提示词拼装时，才使用另外两种模式。

## 注册员工

从 `server/ai/index.ts` 静态 import 这个定义，并在 `registerAIEmployees()` 中调用：

```ts
protected override async registerAIEmployees(
  manager: AIEmployeeManager,
): Promise<void> {
  await manager.registerEmployee(customerSuccess);
}
```

这里没有 Employee 文件系统扫描。目录名也不会自动成为 `username`，实际注册值只来自 `defineAIEmployee()`。

## 相关链接

- [定义自己的 AI 员工](./index.md) — 把员工资源接入应用运行时
- [注册 Tool](./tool.md) — 为员工提供业务操作
- [注册 Skill](./skill.md) — 为员工提供工作方法
- [AI 员工管理](../management/employees.md) — 在管理页调整员工配置
