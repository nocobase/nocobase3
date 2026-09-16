---
title: '注册 Tool'
description: '使用 defineTools 注册 AI 员工可调用的后端 Tool，并设置 Scope、执行位置和权限。'
keywords: 'defineTools,AI Tool,SPECIFIED,GENERAL,ASK,ALLOW,AgentContext'
---

# 注册 Tool

**Tool** 让 AI 员工读取应用数据或执行业务操作。模型只负责决定何时调用和提供参数，真正的输入校验、用户授权和数据范围必须由 Tool 代码执行。

## 定义后端 Tool

在 `server/ai/tools/find-customer.ts` 中默认导出 Tool：

```ts
import { defineTools, type AgentContext } from '@nocobase/ai-employee';
import { z } from 'zod';

type CustomerRecord = {
  id: string;
  ownerId: string | number;
  name: string;
};

export default defineTools<AgentContext>({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ASK',
  introduction: {
    title: 'Find customer',
    about: 'Read one customer that the current user is allowed to access.',
  },
  definition: {
    name: 'find-customer',
    description:
      'Find one customer by ID within the current user access scope.',
    schema: z.object({ customerId: z.string().min(1) }),
  },
  invoke: async (ctx, { customerId }) => {
    const customers = ctx.database.repository<CustomerRecord>('customers');
    const customer = await customers.findOne({
      filter: { id: customerId, ownerId: ctx.actor.id },
    });
    return customer
      ? { status: 'success', content: customer }
      : { status: 'error', content: 'Customer not found or unavailable.' };
  },
});
```

不要接受模型传入的 `userId` 作为授权依据。上面的 Tool 从可信运行时提供的 `ctx.actor` 获取当前身份，通过公开的 `ctx.database` 访问应用集合，并把权限范围带入查询。`ctx.repositories` 属于 AI Employee 插件的内部 RepositoryFactory，不要用它查询应用业务集合。

## 选择 Scope

| `scope`     | 使用方式                                                    |
| ----------- | ----------------------------------------------------------- |
| `GENERAL`   | 所有员工都能发现，适合真正通用且低耦合的能力                |
| `SPECIFIED` | 由 Employee、Skill 或会话设置显式启用，应用 Tool 默认使用它 |
| `CUSTOM`    | 留给调用方或管理配置选择的能力                              |

默认使用 `SPECIFIED`。不要为了让某个员工找到 Tool 就改成 `GENERAL`，应当在 Employee 的 `tools` 或 Skill 的 `tools` 中绑定它。

## 选择权限

| `defaultPermission` | 行为                                   |
| ------------------- | -------------------------------------- |
| `ASK`               | 执行前暂停，由用户允许、拒绝或修改参数 |
| `ALLOW`             | 满足运行时策略时可以直接执行           |

写入数据、发送消息、触发流程、跳转到有副作用的页面或执行不可逆操作时使用 `ASK`。只有无副作用、可重复且结果范围清晰的读取，才考虑 `ALLOW`。

## 注册 Tool

在 `server/ai/index.ts` 中静态 import，并交给 `ToolsManager`：

```ts
protected override async registerTools(manager: ToolsManager): Promise<void> {
  await manager.registerTools(findCustomer);
}
```

同名 Tool 的覆盖行为必须由明确的注册顺序决定，不能依赖目录遍历顺序。Tool 的参数和返回值还要能序列化，不能返回数据库连接、DOM、函数或带循环引用的对象。

## 相关链接

- [定义自己的 AI 员工](./index.md) — 注册应用 AI 资源
- [注册 AI 员工](./employee.md) — 把 Tool 绑定给员工
- [注册 Skill](./skill.md) — 从 Skill 激活 Tool
- [页面上下文](../components/context.md) — 注册只在当前页面可用的前端 Tool
- [Tool 卡片](../components/tool-cards.md) — 为 Tool 结果提供专用界面
