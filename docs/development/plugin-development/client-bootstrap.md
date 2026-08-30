---
title: Client Bootstrap
description: 在 NocoBase v3 插件中使用 Client Bootstrap 执行一次性命令式初始化，并明确 Refine、options、副作用、顺序和测试边界。
---

# Client Bootstrap

Bootstrap 是 App Client 初始化期间执行的命令式入口。它适合注册 Refine resources、live event handlers 或其他必须在启动阶段完成的 Client 配置；页面用 Route，共享 React tree 能力用 Provider，普通组件不需要 Bootstrap。

## 定义 Bootstrap

```ts
import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

import type { AuditLogClientOptions } from './plugin.js';

const bootstrap: AppClientPluginBootstrap<AuditLogClientOptions> = ({
  refine,
  options,
}) => {
  refine.addResources([
    {
      name: 'audit-log',
      list: '/audit-log',
      meta: { label: options.resourceLabel ?? 'Audit log' },
    },
  ]);
};

export default bootstrap;
```

Bootstrap context 提供 `appClient`、`packageName`、`source`、`refine` 和目标 App 传入的 typed options。函数可以返回 `void` 或 `Promise<void>`；异步失败会阻止启动流程继续，错误必须保留足够上下文且不能泄露 secret。

## 声明惰性入口

```ts
export default defineClientPlugin({
  packageName: '@nocobase/app-plugin-audit-log',
  bootstrap: () => import('./bootstrap.js'),
});
```

`client/plugin.ts` 被目标 App 静态 import，应保持轻量。Bootstrap module 通过 loader 在初始化阶段加载；不要把启动副作用放在 module 顶层。多个 bootstrap 按 Application 和插件 registration order 执行，因此顺序依赖必须来自明确的插件组合契约，而不是隐式等待另一个模块副作用。

## 什么时候不要使用

- 渲染页面或导航：使用 Route；
- 提供 React Context：使用 Provider；
- 页面局部数据加载：放在页面/component lifecycle；
- Server service 初始化：使用 ServiceProvider；
- 仅导出公共组件：使用 package exports；
- 可以在普通函数调用时完成的惰性工作。

Bootstrap 可能在测试、开发重启或多个 App 实例中再次执行。注册行为应由框架 registry 保证唯一，或由实现明确处理重复调用；不要依赖进程级布尔变量掩盖不正确的重复注册。

## 测试初始化行为

- 用最小 bootstrap context 调用真实 default export；
- 验证 Refine resources、setters 或 handlers 的精确结果；
- 覆盖默认 options 和目标 App options；
- 覆盖异步成功和失败传播；
- 确认 module import 本身没有启动副作用；
- 在目标 App 测试 Bootstrap 后用户可观察的行为。

`client:inspect` 最多确认 bootstrap entry 和顺序，不执行 Bootstrap。Inspect 成功不能证明 resource、handler 或副作用已正确注册。

返回[Client 模块选择](./client.md)，或阅读[测试和验证插件](./testing.md)。
