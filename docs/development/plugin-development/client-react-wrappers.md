---
title: Client React Wrappers
description: 在 NocoBase v3 插件中使用 defineClientReactWrappers 提供共享 React Context，控制 layer 和顺序，并区分静态声明与真实渲染生命周期。
---

# Client React Wrappers

多个 Client surface 需要共享 React Context 或包裹整个应用树时使用 React Wrapper。单个页面的局部状态留在页面内部；页面入口使用 Route；服务、Refine 配置和命令式启动逻辑使用 [Client ServiceProviders](./client-service-providers.md)。

## 声明 React Wrapper

```ts
import {
  defineClientReactWrappers,
  type AppClientReactWrapperDefinition,
} from '@nocobase/app-client/plugins';

import { AuditProvider } from '../components/audit-provider.js';

export const reactWrappers: readonly AppClientReactWrapperDefinition[] =
  defineClientReactWrappers([
    {
      name: 'audit-log',
      component: AuditProvider,
      layer: 'extension',
    },
  ]);

export default reactWrappers;
```

`name` 在 package 内形成稳定 identity。最终 Client composition 有 `root`、`application` 和 `extension` 三层，插件 Wrapper 只能使用 `extension`；`root` 和 `application` 由 App 声明。

## 控制组合顺序

`before` 和 `after` 引用同一 layer 中的稳定 Wrapper ID，只表达真实依赖。Wrapper A 消费 Wrapper B 的 Context 时，应让依赖关系在 declaration、测试和文档中一致；跨 layer 排序、缺失引用和循环依赖都会被拒绝。

React Wrapper declaration 在 Runtime resolution 时已经静态可见，component 只在 `app.start()` 成功且 Browser Host 渲染 `AppClientRoot` 后执行。Declaration module 不得访问 DOM、发请求或启动 timer；React 副作用放在 effect 中并提供 cleanup，非 React 生命周期工作放在 ServiceProvider。

## 使用 typed options

`reactWrappers` 可以是接收插件 options 的轻量同步 factory：

```tsx
export const reactWrappers = (options: AuditLogClientOptions) =>
  defineClientReactWrappers([
    {
      name: 'audit-log',
      component: createAuditProvider(options.endpoint),
    },
  ]);
```

Options 由目标 App 在 `client/plugins.ts` 调用插件 factory 时传入。不要在 options 或 Inspector 输出 secret。

## 测试两个阶段

- Declaration test：验证 options、name、layer、before/after、component、唯一性和排序。
- React behavior test：包裹测试组件，验证 Context、loading、error、cleanup、重复 mount 和真实页面消费。

`client:inspect --type react-wrappers` 只确认最终 owner、entry、layer 和顺序，不渲染组件，也不能证明 Context 或副作用正确。

## 常见错误

- 为单页局部状态创建全局 Wrapper；
- 在 declaration factory 中访问 `window` 或执行启动副作用；
- 用 React Wrapper 注册 Service 或配置 Refine；
- 用全局变量绕过 React Context；
- 依赖偶然数组顺序而不声明真实依赖。

返回[Client 模块选择](./client.md)，或继续阅读 [Client ServiceProviders](./client-service-providers.md)。
