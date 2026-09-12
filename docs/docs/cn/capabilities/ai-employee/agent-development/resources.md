---
title: '声明 AI 员工并添加技能和工具'
description: '在 ai/employees、ai/skills 和 ai/tools 目录添加应用专属的 AI 资源。'
keywords: 'ai/employees,ai/skills,ai/tools,defineAIEmployee,defineTools'
---

# 声明 AI 员工并添加技能和工具

应用资源应该放在应用自己的 `ai/` 目录，不要修改 `@nocobase/ai-employee` 或 `@nocobase/app-plugin-ai-employee` 的源码。Agent 可以根据 `nocobase-plugin-ai-employee` 技能自动选择资源类型。

## 在 `ai/employees` 添加员工

```ts
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

每个员工都要有唯一且稳定的 `username`。技能和工具名称必须和实际注册的资源一致。

## 在 `ai/skills` 添加技能

技能目录包含一个 `SKILLS.md`：

```markdown
---
scope: SPECIFIED
name: return-policy
description: 根据公司退货政策判断请求需要哪些材料和下一步。
tools: []
---

处理退货问题时：

1. 先读取订单状态和购买时间
2. 区分退款、换货和补寄
3. 缺少信息时向用户提问
4. 不要直接承诺超出政策的结果
```

技能适合放稳定的业务规则和工作步骤。需要调用应用数据时，给技能绑定工具，不要把数据库查询写成模型可以猜测的文本。

## 在 `ai/tools` 添加工具

后端工具应该显式声明作用域、执行位置和默认权限：

```ts
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

工具代码必须自行做业务授权，不能只依赖 system prompt。只读查询可以考虑 `ALLOW`，修改数据、发送通知、删除记录等操作默认使用 `ASK`。

## 让 Agent 做什么检查

把下面的要求追加到任务末尾，能让 Agent 的结果更容易验收：

```text
请确认：
- 员工、技能和工具都是默认导出
- 工具的 schema 和 invoke 参数一致
- 工具返回值可以序列化
- 工具内部检查当前 actor 的权限
- 没有复制内置员工或导入私有模块
- 运行 pnpm lint、pnpm typecheck、pnpm test 和 pnpm build
```

## 相关链接

- [使用 Agent 开发](./index.md) — 选择资源类型
- [在前端使用 AI 员工](./frontend.md) — 把员工接入页面
- [管理 AI 员工](../management/index.md) — 检查员工是否启用
