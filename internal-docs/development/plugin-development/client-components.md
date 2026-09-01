---
title: Client Components
description: 在 NocoBase v3 插件中区分页面、React Provider、公共和内部 React Components，并正确设计导出、依赖、所有权与测试。
---

# Client Components

Component 是 Client UI 的基础源码，但 `client.components` 不是 Client runtime contribution。组件只有被 Route 惰性加载、被 React Provider 渲染、被其他组件引用，或通过公共 package export 被 App 使用时，才进入真实应用行为。

## 先判断组件身份

| 类型          | 谁装配                               | 所有权                           |
| ------------- | ------------------------------------ | -------------------------------- |
| 页面组件      | `componentLoader()`                  | 插件 Route 或 App override       |
| Wrapper 组件  | `defineClientReactProviders()`       | 插件 React Provider contribution |
| 公共组件      | App/其他插件从 package export import | 插件维护 API，消费方组合         |
| 内部组件      | 插件内部 import                      | 插件私有实现                     |
| Registry 组件 | materialize 后由 App import          | 安装副本归 App                   |

需要可导航页面时阅读 [Client Routes](./client-routes-examples.md)；需要共享 React Context 时阅读 [Client React Providers](./client-react-providers.md)；需要交付可编辑源码时阅读 [Registry](./registry.md)。

## 编写最小组件

```tsx
import type { ReactElement } from 'react';

export interface AuditSummaryProps {
  readonly total: number;
}

export function AuditSummary({ total }: AuditSummaryProps): ReactElement {
  return <span>{total} audit records</span>;
}
```

内部组件不必成为公共 export。只有 App 或其他插件需要稳定 import 时，才通过 `client/components/index.ts` 和 `package.json#exports` 暴露明确子路径。消费方不得 import `src/`、`client/components/private/` 等深层实现。

公共组件 contract 包括 props、渲染语义、样式接入和 peer dependencies。变更这些内容时同步类型、README、测试、changeset 和 Plugin Skill 中真正面向 App Agent 的集成说明。

## 页面保持惰性

页面模块通过 Route `componentLoader()` 动态加载，不在 `client/plugin.ts` 静态 import：

```ts
componentLoader: () => import('./pages/audit-log-page.js');
```

页面模块 default-export React component。只替换已有插件页面时使用 component override，不重新声明 Route identity、path 或 auth。

## Browser 和样式边界

- 浏览器组件不得 import Node-only 模块；
- React 等共享关键依赖使用 workspace catalog/peer dependency 约定；
- `sideEffects: false` 只有在所有发布模块都没有 import-time 副作用时才成立；
- 必须保留的 CSS bare import 要精确声明 side effects，或由明确入口加载；
- package public component 和 Registry materialized component 是不同所有权模型。

## 公共组件的 i18n namespace

插件 Route/React Provider tree 会按 contribution 的 `packageName` 提供默认 namespace；但公共组件被 App 或其他插件渲染时处于消费方 render tree。只要组件可能离开本插件 tree，就使用 `useTranslation(PLUGIN_NS)` 或 `withNamespace(PLUGIN_NS, Component)` 显式绑定，不能根据源码目录推断 namespace。

显式绑定不会注册 resources。只有公共 component subpath、没有 `./client` runtime entry 的插件，必须在“文案归 App”和“增加只含 `locales` 的 Client plugin factory 并由 App 注册”之间明确选择；不要假设 component export 会触发 Client plugin registration。完整资源声明和测试见[插件国际化](./i18n.md)。

## 测试和验证

- 组件测试验证 props、用户交互、accessibility 和错误状态；
- 公共 export 测试从正式 subpath import，而不是从源码路径 import；
- 页面测试实际调用 `componentLoader()` 并确认 default export；
- 插件 build 和 pack check 验证声明、exports 和发布文件；
- 目标 App 测试验证真实主题、React Provider、Route 和数据依赖。

公共组件不属于 Client composition，因此不要求出现在 `client:inspect`。Inspect 只会看到装配该组件的 Route 或 React Provider；组件本身由类型、测试、build 和目标 App 行为验证。

返回[Client 模块选择](./client.md)，或继续阅读 [Client React Providers](./client-react-providers.md)。
