---
title: Client 模块选择
description: 面向 AI Agent 的 NocoBase v3 Client 插件模块导航，帮助在 Components、Routes、Providers、Bootstrap、options 和 Registry 之间选择正确所有权。
---

# Client 模块选择

Client 插件的 runtime contributions 只有 `routes`、`providers` 和 `bootstrap`，全部可选且通过 loader 惰性导入。`locales` 是独立的翻译资源声明，不是第四种 UI contribution；Components 是 UI 源码或公共导出能力；Settings 属于 Routes；Registry 是 App-owned 源码 materialization。

## 按需求选模块

| 需求                                    | 使用                      | 继续阅读                                     |
| --------------------------------------- | ------------------------- | -------------------------------------------- |
| React UI 构件或公共组件                 | Components                | [Client Components](./client-components.md)  |
| 普通可导航页面                          | `defineAppRoutes()`       | [Client Routes](./client-routes-examples.md) |
| Settings 页面                           | `defineSettingsRoutes()`  | [Client Routes](./client-routes-examples.md) |
| 替换插件已有页面 UI                     | Route component override  | [Client Routes](./client-routes-examples.md) |
| 多个 Client surfaces 共享 React Context | `defineClientProviders()` | [Client Providers](./client-providers.md)    |
| App 初始化时执行命令式配置              | Client Bootstrap          | [Client Bootstrap](./client-bootstrap.md)    |
| 不同 App 传入不同稳定配置               | Client plugin options     | 本页“共享 typed options”                     |
| 翻译 Client 页面或公共组件              | Client locale resources   | [插件国际化](./i18n.md)                      |
| 安装后让 App 直接编辑源码               | Registry                  | [Plugin Registry](./registry.md)             |

优先使用最局部的所有权：单页面状态留在页面，普通组件不创建 Provider，可以惰性完成的工作不放 Bootstrap，只替换 UI 时不重复声明 Route。

## 理解装配关系

```text
Components
  ├── componentLoader() → App / Settings Route
  ├── Provider component → Client Provider
  ├── package export → App or another plugin
  └── Registry recipe → App-owned source

Bootstrap → imperative Client initialization
```

Client Route 的 `auth/access` 只保护浏览器导航和组件加载，不能代替 Server authentication/authorization。

## 声明 Client 插件

`client/plugin.ts` 只组合轻量 loaders：

```ts
import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface AuditLogClientOptions {
  readonly resourceLabel?: string;
}

const auditLog: AppClientPluginFactory<AuditLogClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-audit-log',
    locales: () => import('./locales/index.js'),
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });

export default auditLog;
```

只保留真实存在的 entries。`client/index.ts` default-export registration factory，`package.json#exports["./client"]` 指向 source/build 对应入口，目标 App 在 `client/plugins.ts` 显式调用 factory。

## 共享 typed options

目标 App 调用：

```ts
auditLog({ resourceLabel: 'Audit logs' });
```

同一 resolved options 会传给 Bootstrap context、Routes factory 和 Providers factory，也可用于 `routeComponentOverrides(options)`。无配置插件使用默认 `TOptions = void`，不创建虚假的空 options interface。Options 是公共 App 集成契约；不要包含无法安全序列化或需要输出到 inspect 的 secret。

## Lazy loading 和副作用

目标 App会静态 import `client/plugin.ts`，因此它只能 value-import 轻量 registration API。页面和实现 entries 留在 dynamic import 后面。Routes/Providers factory 在 composition 时执行，Bootstrap 在初始化时执行，页面 `componentLoader()` 在真正导航时执行，Provider component 在 React render 时执行。

声明模块顶层不得发请求、操作 DOM、启动定时器或修改全局状态。只有所有发布模块都没有 import-time 副作用时才设置 `sideEffects: false`；CSS 等必要副作用应精确声明。

## 测试和最终装配确认

先测试模块自身契约和行为，再运行插件 lint、typecheck、test、build。注册发生变化时，最后运行：

```bash
pnpm plugin:inspect <name> --app <app> --json
pnpm --filter <target-app> client:inspect --json
```

Inspector 只确认插件登记和最终 Client composition，不执行 Bootstrap、不加载页面、不渲染 Provider，也不验证 UI 行为。目标 App 测试和浏览器/full-stack 验证仍然负责真实结果。

## Agent 自检

- 没有创造第四个 `settings` 或 `components` runtime loader；
- Components、Routes、Providers、Bootstrap 的职责没有混用；
- entries、exports、目标 App registration 与真实实现一致；
- 页面保持 lazy，declaration 顶层没有启动副作用；
- options 是最小、稳定、typed 的 App 契约；
- App-facing UI、入口、权限或集成方式变化已更新 Plugin Skill。
