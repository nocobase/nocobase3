---
title: Client Providers
description: 在 NocoBase v3 插件中使用 defineClientProviders 提供共享 React Context，控制 layer 和顺序，并区分 declaration 与真实渲染生命周期。
---

# Client Providers

多个 Client surfaces 需要共享 React Context、状态或 Browser capability 时使用 Provider。单个页面的局部状态留在页面内部；页面入口用 Route；一次性命令式初始化用 [Bootstrap](./client-bootstrap.md)。

## 声明 Provider

```ts
import {
  defineClientProviders,
  type AppClientProviderDefinition,
} from '@nocobase/app-client/plugins';

import { AuditProvider } from './components/audit-provider.js';

const providers: readonly AppClientProviderDefinition[] = defineClientProviders(
  [
    {
      name: 'audit-log',
      component: AuditProvider,
      layer: 'extension',
    },
  ],
);

export default providers;
```

Provider `name` 在 package 内形成稳定 identity。最终 Client composition 有 `root`、`application` 和 `extension` 三层，但插件 Provider 只能使用 `extension`；`root` 和 `application` 由 App 自己声明。插件不能为了扩大包裹范围把自己的 Provider 提升到 root。

## 控制组合顺序

`before` 和 `after` 引用同一 layer 中的稳定 Provider ID，用于表达真实依赖，不用于装饰性排序。不要依赖目标 App 当前数组位置的偶然结果。Provider A 消费 Provider B 的 Context 时，应让依赖关系在 declaration、测试和文档中一致；跨 layer 排序会被拒绝。

Provider factory 在 Client contribution resolution 时执行；React Provider component 只在 App tree 渲染时执行。Factory 必须保持轻量，不访问 DOM、不发请求、不启动定时器。真实副作用放在 React lifecycle 中并提供 cleanup，或者在确实属于一次性初始化时使用 Bootstrap。

## 使用 typed options

`providers.ts` 的 default export 可以是接收插件 options 的 factory：

```tsx
import type { PropsWithChildren, ReactElement } from 'react';

function ConfiguredAuditProvider({
  children,
}: PropsWithChildren): ReactElement {
  return <AuditProvider endpoint='/api/audit-log'>{children}</AuditProvider>;
}

export default function createProviders(
  _options: AuditLogClientOptions,
): readonly AppClientProviderDefinition[] {
  return defineClientProviders([
    {
      name: 'audit-log',
      component: ConfiguredAuditProvider,
    },
  ]);
}
```

Options 由目标 App 在 `client/plugins.ts` 调用插件 factory 时传入。不要在 inspect 输出 secret，也不要让 Provider 私自读取另一个 App 的源码配置。

## 测试两个阶段

Declaration test：

- factory 接收正确 options；
- name、layer、before/after 和 component 正确；
- Provider identity 唯一，排序依赖没有缺失或循环。

React behavior test：

- 包裹测试组件并验证 Context value；
- 覆盖 loading、error、cleanup 和重复 mount；
- 真实页面能消费 Provider；
- 多个 Provider 的依赖顺序符合契约。

`client:inspect` 只确认 Provider 的最终 owner、entry、layer 和顺序，不渲染 Provider，也不能证明 Context 或副作用正确。

## 常见错误

- 为单页局部状态创建全局 Provider；
- 在 declaration factory 中访问 `window` 或启动副作用；
- 用 Provider 代替 Route 或 Bootstrap；
- 用全局变量绕过 React Context；
- 依赖偶然数组顺序而不声明真实依赖；
- 为了共享实现而公开插件私有组件深层路径。

返回[Client 模块选择](./client.md)，或继续阅读 [Client Bootstrap](./client-bootstrap.md)。
