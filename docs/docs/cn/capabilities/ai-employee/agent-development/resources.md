---
title: '显式注册 AI 员工并添加技能和工具'
description: '在 server/ai 中静态定义并注册 AI 员工和工具，并使用 SKILL.md 加载技能。'
keywords: 'server/ai/employees,server/ai/tools,ai/skills,SKILL.md,AIResourceRegistrar'
---

# 显式注册 AI 员工并添加技能和工具

应用自定义 Employee 和 Tool 定义在应用源码的 `server/ai/` 下，由聚合文件静态导入，并通过 `AIResourceRegistrar` 在应用 Server Provider 的 `boot()` 中注册。

## 定义 Employee

```ts
// server/ai/employees/customer-support.ts
import { defineAIEmployee } from '@nocobase/ai-employee';

export default defineAIEmployee({
  username: 'customer-support',
  category: 'business',
  nickname: '客户支持',
  description: '回答客户问题并整理售后请求。',
  systemPrompt: '回答前先确认订单和客户信息，不要编造政策。',
  skills: ['return-policy'],
  tools: [{ name: 'lookup-order', autoCall: false }],
});
```

Employee prompt 直接写在 TypeScript 定义的 `systemPrompt` 字段中，Employee 所需的 Skill 和 Tool 通过定义中的名称显式配置。

## 定义 Tool

Tool 放在 `server/ai/tools/`，名称和描述都来自 `defineTools()` 定义，不使用文件名或 `description.md` 推断。

```ts
// server/ai/tools/lookup-order.ts
import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ASK',
  definition: {
    name: 'lookup-order',
    description: '查询当前用户有权访问的订单状态。',
    schema: z.object({ orderId: z.string() }),
  },
  invoke: async (_ctx, { orderId }) => ({
    status: 'success',
    content: { orderId },
  }),
});
```

Tool 必须自行执行业务授权，不能只依赖 `systemPrompt`。

## 聚合并注册资源

```ts
// server/ai/index.ts
import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import employee from './employees/customer-support.js';
import tool from './tools/lookup-order.js';

export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    aiEmployeeManager: AIEmployeeManager,
  ): Promise<void> {
    await aiEmployeeManager.registerEmployee(employee);
  }

  protected override async registerTools(
    toolsManager: ToolsManager,
  ): Promise<void> {
    await toolsManager.registerTools(tool);
  }
}
```

在应用自己的 Server Provider `boot()` 中解析当前 App 的 `aiManagerToken`，然后调用 `new AppAIResources().registerAIResources(ai)`。不要创建第二个 `AIManager`。生命周期顺序固定为：

```text
Tool -> MCP -> Skill -> AI Employee
```

同名资源的覆盖策略必须由显式注册顺序或明确的 Manager API 表达。

## 定义 Skill

Skill 仍由 `SkillsLoader` 加载。每个 Skill 目录使用严格命名的 `SKILL.md`：

```text
ai/skills/return-policy/SKILL.md
```

Skill 的 frontmatter 契约保持不变，Skill 下的局部 `tools/` 属于 Skill loader 能力，不是 Employee 的自动发现能力。

插件默认加载发布包根目录的 `ai/skills`，随后加载 App 根目录的 `ai/skills`，最后加载 `config.yml` 中 `ai.skills.paths` 指定的目录。配置路径支持绝对路径和相对于 App root 的路径，空白项和重复项会被忽略，不存在的目录只记录 warning。
