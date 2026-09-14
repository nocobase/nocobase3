---
title: '页面和菜单'
description: '在 client/routes.ts 里加一条路由作为菜单入口，接上页面组件，再编写页面内容。'
keywords: 'NocoBase,页面,路由,菜单,导航,访问控制'
---

# 页面和菜单

下面讲解一下，如何添加一个页面。

## 添加一个菜单

首先，需要在 `client/routes.ts` 里加一条路由，通过 `navigation` 配置菜单的名称和图标：

```ts
// client/routes.ts
import { Package } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    navigation: { title: 'Orders', icon: Package },
    componentLoader: () => import('./pages/orders.js'),
  },
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
```

`title` 是菜单的名称，`icon` 是菜单图标，值是一个 React 组件。图标可以用 [lucide-react](https://lucide.dev/) 提供的组件，也可以自己写一个 React 组件。

### 菜单分组

把子页面放进父级的 `children`，父级就成了一个菜单分组。分组本身不需要 `componentLoader`：

```ts
// client/routes.ts（节选）
defineAppRoutes([
  {
    name: 'business',
    navigation: { title: 'Business' },
    children: [
      {
        name: 'orders',
        path: '/orders',
        navigation: { title: 'Orders', icon: Package },
        componentLoader: () => import('./pages/orders.js'),
      },
    ],
  },
]);
```

分组可以带 `path`，作为子页面的路径前缀。比如下面的分组配置了 `path: '/business'`，子页面最终可以通过 `/business/orders` 访问：

```ts
defineAppRoutes([
  {
    name: 'business',
    path: '/business',
    navigation: { title: 'Business' },
    children: [
      {
        name: 'orders',
        path: '/orders',
        navigation: { title: 'Orders' },
        componentLoader: () => import('./pages/orders.js'),
      },
    ],
  },
]);
```

## 添加页面并编写组件

页面组件就是普通的 React 组件，文件放在 `client/pages/` 下，并使用 default export。界面可以组合 shadcn/ui 组件，样式使用主题变量，以适配浅色和深色主题。组件和样式的具体用法见[界面和样式](./components-and-styling)。

```tsx
// client/pages/orders.tsx
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

export default function OrdersPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <section className='space-y-4 p-6'>
      <h1 className='font-heading text-xl'>{t('orders.title')}</h1>
      <p className='text-sm text-muted-foreground'>{t('orders.description')}</p>
    </section>
  );
}
```

页面中的文字使用翻译 key，需要将对应的翻译添加到 `client/locales/`，见[多语言](./i18n)。如果页面需要请求数据，还要分别处理加载中、无数据和请求失败的状态。

编写路由和页面时，注意以下几点：

- 使用 `componentLoader` 实现惰性加载，只有访问页面时才会加载对应代码。
- import 路径使用 `.js`，即使页面文件的实际扩展名是 `.tsx`。
- `path` 只填写应用内部路径，不要加入部署前缀。比如应用部署在 `/main` 下，路由写 `/orders`，浏览器访问地址就是 `/main/orders`。
- 路由不配置 `navigation` 时，页面仍然可以通过 URL 访问，但不会出现在菜单中，详情页通常采用这种方式。

### 控制页面的登录要求

在路由上设置 `auth`，可以控制用户需要以哪种登录状态访问页面：

| 值         | 行为                                               |
| ---------- | -------------------------------------------------- |
| `required` | 只有已登录用户可以访问；不设置时默认使用此值。     |
| `guest`    | 仅供未登录用户访问；已登录用户会被跳转离开。       |
| `optional` | 登录前后都可以访问；页面根据登录状态决定显示内容。 |

比如，下面三条路由分别只允许已登录用户、未登录用户和所有用户访问：

```ts
defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    auth: 'required',
    componentLoader: () => import('./pages/orders.js'),
  },
  {
    name: 'login-help',
    path: '/login-help',
    auth: 'guest',
    componentLoader: () => import('./pages/login-help.js'),
  },
  {
    name: 'about',
    path: '/about',
    auth: 'optional',
    componentLoader: () => import('./pages/about.js'),
  },
]);
```

子路由会继承父路由的 `auth`，不能单独设置其他值。`auth` 只在前端生效，用于控制页面导航。

## 相关链接

- [界面和样式](./components-and-styling) — 使用 shadcn/ui 组件和主题变量编写页面
- [多语言](./i18n) — 为页面文案添加翻译
- [服务端路由](./server-routes) — 为页面调用的接口声明服务端路由
- [路由参考](../reference/routes) — 查看客户端和服务端路由的类型与路径规则
- [主题变量](../reference/theme-tokens) — 查看颜色、字体、间距、圆角和阴影等主题变量
