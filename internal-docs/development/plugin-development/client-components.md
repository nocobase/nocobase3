---
title: Client Components
description: 在 NocoBase v3 插件中区分页面、React Provider、公共和内部 React Components，优先使用插件本地的 shadcn/ui，并正确设计导出、依赖、所有权与测试。
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

## UI 实现默认优先使用 shadcn/ui

实现 Button、Input、Select、Dialog、Sheet、Table、Tabs、Tooltip、Dropdown Menu、Form 等常见交互或界面模式时，必须先检查 shadcn/ui 是否已有对应组件，并优先通过 shadcn CLI 把源码添加到当前插件。不要先手写一套重复的 primitive，也不要从已经删除的 `@nocobase/ui` 或 `@nocobase/app-client/ui` 导入。

这里的“优先”不表示每个 JSX 元素都必须来自 shadcn。`section`、`div`、标题、段落和只有原生语义的简单元素可以直接编写；业务组件通常使用 Tailwind utilities 组合布局，并复用 shadcn primitives 完成交互、状态、可访问性和一致的主题表现。只有 shadcn 没有合适 primitive，或者现有 primitive 无法满足明确的业务语义时，才实现插件自己的基础组件，并在代码中保持同样的 accessibility 和主题约定。

shadcn/ui 是源码分发方式，不是 NocoBase 的共享运行时 UI 包。插件运行时使用的 shadcn 源码由插件自己拥有，放在 `client/components/ui/`，跟随插件发布和升级；不得依赖消费 App 的 `client/components/ui/`。Registry 安装源码的所有权不同：安装后由 App 拥有，因此 Registry source 可以通过 `@/components/ui/*` 使用 App 的 primitives。完整区别见 [Registry](./registry.md)。

## 为插件初始化 shadcn/ui

需要编写业务 UI，但插件根目录还没有 `components.json` 时，先参考 `packages/examples/app-plugin-registry-example/components.json` 添加下面的配置：

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "client/styles.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",
  "menuAccent": "subtle"
}
```

同时准备 shadcn 的生成入口 `client/styles.css`：

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import 'shadcn/tailwind.css';

/* Generation entrypoint only. The host application owns the theme tokens. */
```

插件 `tsconfig.json` 中的 `@/*` 必须指向插件自己的 `client/*`：

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./client/*"]
    }
  }
}
```

在插件的 `devDependencies` 中维护 `shadcn`、`tailwindcss` 和 `tw-animate-css`。生成组件实际 import 的包，例如 `@base-ui/react`、`class-variance-authority`、`clsx`、`tailwind-merge` 或图标库，属于插件运行时依赖，必须保留在 `dependencies`；不要因为它们由 CLI 添加就移动到根包或假设 App 会提供。

然后在插件目录按需添加组件，可以一次添加多个：

```bash
cd packages/plugins/app-plugin-audit-log
pnpm exec shadcn add button card dialog
```

不要为了“可能以后会用”批量生成全部组件，只添加当前实现实际使用的 primitives。不要使用 `--overwrite` 覆盖已经定制的组件，除非已经检查 diff 并明确接受覆盖。

CLI 生成结束后仍需按本仓库的声明输出和 ESM 规则复查代码：

- 为导出的函数、组件、常量和默认参数补充明确类型；匿名返回结构提取为具名导出类型；
- 将插件运行时代码中的内部 alias import 改为相对路径并带 `.js` 后缀，例如 `../../lib/utils.js`；TypeScript 的 `paths` 不会替换发布后 JavaScript 中的 import specifier；
- 业务组件同样通过相对 `.js` 路径引用插件自己的 `client/components/ui/*`；
- 删除没有实际使用的生成文件和依赖，并运行插件的 lint、typecheck、test 和 build；
- 修改依赖后按仓库要求运行 `CI=true pnpm install --no-frozen-lockfile`，同步 `pnpm-lock.yaml`。

`packages/examples/app-plugin-registry-example` 展示了完整的 `components.json`、`client/styles.css`、`client/lib/utils.ts`、package dependencies 和经过声明输出适配的 `client/components/ui/button.tsx`，需要可运行参考时以它为准。

## 编写业务组件

下面的组件用普通 HTML 负责结构和文本语义，用插件本地的 shadcn `Button` 和 `Card` primitives 负责可交互控件和界面基础样式：

```tsx
import type { ReactElement } from 'react';

import { Button } from './ui/button.js';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from './ui/card.js';

export interface AuditSummaryProps {
  readonly onViewRecords: () => void;
  readonly total: number;
}

export function AuditSummary({
  onViewRecords,
  total,
}: AuditSummaryProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit records</CardTitle>
        <CardAction>
          <Button variant='outline' onClick={onViewRecords}>
            View records
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className='text-2xl font-semibold'>{total}</p>
      </CardContent>
    </Card>
  );
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
