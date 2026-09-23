---
title: '定义自己的 AI 员工'
description: '在 NocoBase 应用中定义并注册 AI Employee、Tool 和 Skill。'
keywords: 'NocoBase,AI Employee,defineAIEmployee,defineTools,SKILL.md'
---

# 定义自己的 AI 员工

当内置员工的角色或能力不能覆盖业务需求时，可以在应用源码中定义自己的 AI 员工。通常来说，一个完整的员工会组合三类源码资源：Employee 保存身份和角色设定，Tool 执行业务操作，Skill 描述工作方法。MCP 连接不属于应用源码资源，只能在 `config.yml` 中配置。

这些资源都接入 AI 员工插件已经创建的 `AIManager`。不要在普通应用中调用 `createAIManager()`，也不要从 `@nocobase/app-plugin-ai-employee/server/agent/*` 这类私有路径导入实现。

## 每类资源在哪里注册

每类资源只有一条注册路径，没有第二种方式：

| 资源      | 在哪里声明                                   | 由谁注册                                        |
| --------- | -------------------------------------------- | ----------------------------------------------- |
| 后端 Tool | `server/ai/tools/<name>.ts`，`defineTools()` | 静态 import 到 `server/ai/index.ts`，由应用注册 |
| AI 员工   | `server/ai/employees/<name>/index.ts`        | 静态 import 到 `server/ai/index.ts`，由应用注册 |
| Skill     | `ai/skills/<name>/SKILL.md`                  | AI 员工插件扫描目录中的 `**/SKILL.md`           |
| MCP 服务  | `config.yml` 的 `ai.mcpServers`              | AI 员工插件在读取配置时注册                     |
| LLM 服务  | `config.yml` 的 `ai.llmServices`             | AI 员工插件在读取配置时注册                     |

Employee 和 Tool 没有文件系统扫描。Skill 目录里也不定义 Tool——Skill 的 `tools` 只写已经在代码里注册好的 Tool 名称。所以动手的顺序是：先写 Tool 并注册，再写点名它的 Skill，最后在员工里引用 Skill。

`AIResourceRegistrar` 按 Tool、MCP、Skill、Employee 的固定顺序注册，不过名称能不能解析并不取决于这个顺序：员工引用的 Skill 和 Tool 是在 Agent 运行时按名称查找的，不是在注册时检查的。所以应用员工可以引用任何地方注册的 Skill 和 Tool，包括插件在应用 Provider 运行之前就注册好的内置资源。写错的名称在注册时也不会报错，只会在运行时找不到。

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

## 让内置数据 Tool 读到业务集合

内置的 `data-metadata`、`data-query` Skill 和它们点名的数据 Tool（比如 `getDataSources`、`dataSourceQuery`）只读取应用已经为权限注册的集合：集合要注册成权限资源、带有 `read` 操作，并且授予了当前用户。它们按当前用户的权限读取，包括通过团队等成员关系继承的权限。怎样注册资源和授予权限属于权限插件，见 [权限](../../authorization/index.md)。AI 员工插件额外有两点要求：

- **资源 ID 必须是 `<connection>.<collection>` 两段形式。** 比如 `main.orders` 能被看到，只写 `orders` 的资源会被跳过；这里没有默认连接的别名。这个 ID 也是应用在权限声明、路由守卫和授权中使用的同一个 ID，已有资源改名要在所有引用处一起改，同时注册两种名称则会得到两个分别授权的资源。所以最好在还没有数据要迁移时就定下来。
- **看不到时不会报错。** 没有注册、用了单段名称、缺少 `read` 操作或没有授予当前用户的集合，会直接从目录中消失，也不写日志。一个连接只有在至少有一个可读集合时才会出现，所以当某个连接下的集合都读不到时，整个数据源都会消失：`getDataSources` 返回空，AI 员工回答没有任何数据源。遇到这种情况，先检查集合的权限注册和授予，而不是数据库配置。

新增一张希望 AI 员工能查询的业务集合时，把它的权限注册当作建表的一部分。完成后先让 AI 员工列出集合，确认它能看到，再编写依赖它的 Skill 或提示词。

## 相关链接

- [注册 AI 员工](./employee.md) — 定义员工身份、角色和能力绑定
- [注册 Tool](./tool.md) — 添加有权限边界的后端操作
- [注册 Skill](./skill.md) — 编写可加载的 `SKILL.md`
- [配置 MCP](../configuration/mcp.md) — 只通过 `config.yml` 声明 MCP 连接
- [权限](../../authorization/index.md) — 注册业务集合并授予读取权限
