---
title: '声明 AI 员工'
description: '使用 Agent 在 ai/employees 目录声明应用专属的 AI 员工。'
keywords: 'AI 员工,ai/employees,defineAIEmployee,Agent'
---

# 声明 AI 员工

应用专属的 AI 员工必须声明在应用源码的 `ai/employees/` 目录。推荐直接告诉 Agent 你的业务目标，让 Agent 检查当前应用并完成员工定义、加载和验证。

## 让 Agent 声明员工

在开发任务中说明员工职责、允许使用的工具、模型限制和验收要求。Agent 会根据 `nocobase-plugin-ai-employee` 技能在 `ai/employees/` 下生成员工定义，并完成加载检查。

推荐明确要求 Agent 验证以下内容：

- 员工使用稳定且唯一的 `username`
- 员工定义使用默认导出
- 绑定的技能和工具名称已经注册
- 员工可以在管理后台列表中找到
- 运行对应的 lint、typecheck、test 和 build

Agent 应该生成类似下面的员工定义：

```ts
import { defineAIEmployee } from '@nocobase/ai-employee';

export default defineAIEmployee({
  username: 'sales-assistant',
  category: 'business',
  nickname: '销售助手',
  description: '整理销售线索并总结客户需求。',
  systemPrompt: '只使用当前会话提供的数据，不猜测缺失信息。',
  skills: ['lead-qualification'],
  tools: [{ name: 'lookup-lead', autoCall: false }],
});
```

目录结构如下：

```text
ai/
└── employees/
    └── sales-assistant/
        ├── index.ts
        └── prompt.md       # 可选
```

`username` 是稳定标识，会被聊天任务、会话和前端快捷入口引用。员工定义发布后不要随意修改。

## 在管理后台确认

进入管理后台的「AI 员工」设置，打开「AI 员工」页签，确认员工已经加载。

如果列表中没有员工，按以下顺序检查：

1. `index.ts` 是否使用了默认导出
2. `username` 是否唯一
3. 应用是否从正确的根目录启动
4. AI 员工插件是否启用
5. 当前用户是否有查看该员工的权限

## 内置员工和应用员工

应用不需要复制插件内置员工的定义。需要使用内置员工时，通过稳定的 `username` 选择它；只有业务角色、工具组合或模型限制确实不同，才在源码中声明新的应用员工。

:::warning 注意

不要在业务页面暴露开发用途的员工。面向终端用户的员工应该使用业务类别，并经过角色权限检查。

:::

## 下一步

- [使用 Agent 开发](../agent-development/index.md) — 添加技能、工具和前端聊天
- [管理 AI 员工](../management/index.md) — 调整员工状态、模型和能力
