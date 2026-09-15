---
title: '定义自己的 AI 员工'
description: '在 NocoBase 应用中定义并注册 AI Employee、Tool 和 Skill。'
keywords: 'NocoBase,AI Employee,defineAIEmployee,defineTools,SKILL.md'
---

# 定义自己的 AI 员工

当内置员工的角色或能力不能覆盖业务需求时，可以在应用源码中定义自己的 AI 员工。通常来说，一个完整的员工会组合三类源码资源：Employee 保存身份和角色设定，Tool 执行业务操作，Skill 描述工作方法。MCP 连接不属于应用源码资源，只能在 `config.yml` 中配置。

这些资源都接入 AI 员工插件已经创建的 `AIManager`。不要在普通应用中调用 `createAIManager()`，也不要从 `@nocobase/app-plugin-ai-employee/server/agent/*` 这类私有路径导入实现。

## 注册顺序

应用使用 `AIResourceRegistrar` 组织 Employee 和 Tool，并在 Skill 已加载后注册员工：

```text
Tool → Skill → AI Employee
```

这个顺序让 Employee 可以安全引用已经注册的 Skill 和 Tool。Employee 和 Tool 通过 TypeScript 静态 import 聚合；Skill 由 `SkillsLoader` 读取 `SKILL.md`。MCP 服务由 `config.yml` 单独配置。

## 推荐目录

```text
server/
├── ai/
│   ├── employees/sales-assistant/index.ts
│   ├── tools/find-customer.ts
│   └── index.ts
└── providers/
    ├── ai-resources.ts
    └── index.ts
ai/
└── skills/customer-follow-up/SKILL.md
```

## 聚合应用资源

先在 `server/ai/index.ts` 中聚合 Employee 和 Tool。应用根目录的 `ai/skills` 已由 AI 员工插件自动加载，不需要在这里重复添加。

```ts
import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import salesAssistant from './employees/sales-assistant/index.js';
import findCustomer from './tools/find-customer.js';

export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    manager: AIEmployeeManager,
  ): Promise<void> {
    await manager.registerEmployee(salesAssistant);
  }

  protected override async registerTools(manager: ToolsManager): Promise<void> {
    await manager.registerTools(findCustomer);
  }
}
```

## 接入应用生命周期

在应用自己的 ServiceProvider 中解析 AI 员工插件导出的原始 `aiManagerToken`，然后注册资源。

```ts
import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { ServiceProvider } from '@nocobase/service-provider';
import AppAIResources from '../ai/index.js';

export default class AIResourcesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/ai-resources';

  public override async boot(): Promise<void> {
    const ai = this.app.container.resolve(aiManagerToken);
    const resources = new AppAIResources({ source: 'application' });
    await resources.registerAIResources(ai);
  }
}
```

最后把 Provider 加入 `server/providers/index.ts` 的 `serviceProviders` 数组，并确保它排在 AI Employee 插件 Provider 完成 `boot()` 之后。`AIResourceRegistrar` 是显式生命周期 API，插件当前没有接收自定义 Registrar 的装配选项，因此应用 Provider 必须主动调用它。应用 Runtime 会统一驱动 `register → boot → start → ready → shutdown`，不要在模块顶层执行注册。

## 相关链接

- [注册 AI 员工](./employee.md) — 定义员工身份、角色和能力绑定
- [注册 Tool](./tool.md) — 添加有权限边界的后端操作
- [注册 Skill](./skill.md) — 编写可加载的 `SKILL.md`
- [配置 MCP](../configuration/mcp.md) — 只通过 `config.yml` 声明 MCP 连接
