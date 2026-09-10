---
title: '页面和菜单'
description: '在 client/routes.ts 里加一条路由作为菜单入口，接上页面组件，再编写页面内容。'
keywords: 'NocoBase,页面,路由,菜单,导航,访问控制,设置页'
---

# 页面和菜单

加一个页面分三步：加一条路由声明作为菜单入口，给这条声明接上页面组件，再写页面内容。菜单和页面写在同一处，也就是 `client/routes.ts`。下面用「订单」页面走一遍。

## 添加一个页面菜单

在 `client/routes.ts` 里加一条路由，其中 `navigation` 描述的就是侧边栏菜单项：

```ts
// client/routes.ts
import { Package } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    navigation: { title: 'navigation.orders', icon: Package },
    componentLoader: () => import('./pages/orders.js'),
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
```

`title` 是翻译 key，不是写死的中文。文案先加到 `client/locales/en-US.ts`，它定义了翻译文件的结构，再在 `client/locales/zh-CN.ts` 里给译文：

```ts
// client/locales/en-US.ts（节选）
navigation: {
  orders: 'Orders',
},
```

```ts
// client/locales/zh-CN.ts（节选）
navigation: {
  orders: '订单',
},
```

`icon` 是接受 `className` 的组件，`lucide-react` 的图标可以直接用。菜单顺序就是数组顺序。

<!-- 需要一张侧边栏中出现「订单」菜单项的截图 -->

### 菜单分组

把子页面放进父级的 `children`，父级就成了一组菜单。分组本身没有 `componentLoader`，只负责组织菜单：

```ts
// client/routes.ts（节选）
defineAppRoutes([
  {
    name: 'business',
    navigation: { title: 'navigation.business' },
    children: [
      {
        name: 'orders',
        path: '/orders',
        navigation: { title: 'navigation.orders', icon: Package },
        componentLoader: () => import('./pages/orders.js'),
      },
    ],
  },
]);
```

分组也可以带 `path`，作为子页面的路径前缀。页面同样可以有 `children`，用来放 Tab 或子页面，这时要在父页面里自己放一个 `<Outlet />`。

带参数的页面和通配符页面不能作为菜单目标，不要给它们写 `navigation`。用 URL 打开这类页面时，侧边栏会选中它最近的可见菜单项。

## 添加页面，并跟菜单关联

上一步的路由已经用 `componentLoader` 指向了页面组件，把文件建出来就关联上了：

```tsx
// client/pages/orders.tsx
import type { ReactElement } from 'react';

export default function OrdersPage(): ReactElement {
  return <section className='p-6'>订单</section>;
}
```

页面组件必须 default export。菜单和页面之间不需要额外关联，菜单项读的就是这条路由。几个容易写错的点：

- `componentLoader` 保持惰性加载，页面代码只在真正跳转过去时才下载。
- import 路径写 `.js`，即使文件其实是 `.tsx`。这是这个项目的模块解析方式，不是笔误。
- `path` 是应用内部路径，不要写部署前缀。应用挂在 `/main` 下，路由里写 `/orders`，浏览器里打开的地址是 `/main/orders`。
- 不写 `navigation` 的页面照样能通过 URL 打开，只是不进菜单。详情页这类通常就这样。

### 控制谁能打开

`auth` 决定页面的访问方式：

| 值         | 用在什么地方                                       |
| ---------- | -------------------------------------------------- |
| `required` | 只有登录用户能打开，根路由不写时也是这个默认值     |
| `guest`    | 登录、注册、找回密码等访客页面，已登录用户会被跳走 |
| `optional` | 登录前后都能打开，页面自己根据登录状态调整显示     |

子路由继承父级的 `auth`，不能改成别的值。`auth` 只管浏览器里的导航，不是服务端的安全边界。页面里调用的接口要在自己的服务端路由中独立校验身份和权限，见[接口](./server-routes)。

## 编写页面代码

页面就是普通的 React 组件，用 shadcn/ui 的组件拼，样式走主题变量，这样浅色和深色主题都正常。用哪些组件、样式怎么写，见[界面和样式](./components-and-styling)。

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

页面上的文字都要有翻译 key，同样加到 `client/locales/` 里，见[多语言](./i18n)。要取数据时记得处理加载、空和错误三种状态，见[界面和样式](./components-and-styling)。

## 设置页和开发页

设置页用 `defineSettingsRoutes()` 声明，挂在 `/settings` 下；开发页用 `defineDevRoutes()`，挂在 `/dev` 下。两者写法一样，path 里都不要重复写 `/settings` 或 `/dev`。

```ts
const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'orders',
    path: '/orders',
    navigation: { title: 'navigation.orders' },
    access: { resource: 'orders.settings', action: 'read' },
    componentLoader: () => import('./pages/orders-settings.js'),
  },
]);
```

`access` 是加载页面之前的权限检查。被拒绝时页面从导航里消失，直接打开 URL 也不会加载组件。没写 `access` 的页面对所有能进入设置中心的登录用户开放。

开发页在生产构建里完全不存在，页面组件和只被它们 import 的模块都不会进入打包产物。它是打包边界，不是权限边界。需要在生产环境按角色控制的页面，用带 `access` 的设置页，并由服务端强制执行。

## 换掉插件提供的页面

不要为了换一个插件的页面重新声明它的路由，重复声明 `/login` 是冲突，不是定制。插件如果为这个页面提供了选项，就在 `client/plugins.ts` 注册插件时传进去；否则用 `client/extensions/<name>/extension.ts` 扩展，或在 `client/route-overrides.ts` 里加一条只替换 `componentLoader` 的 override。

## 相关链接

- [界面和样式](./components-and-styling)：组件怎么选、样式怎么写。
- [接口](./server-routes)：页面调用的服务端接口，以及它自己的安全边界。
- [多语言](./i18n)：页面文案怎么加翻译。
- [路由类型对照](../reference/routes)：五种路由分别挂在什么路径下。
- [主题变量](../reference/theme-tokens)：颜色、字体、字号、间距这些变量可以用哪些。
- [权限](../capabilities/authorization)：角色、菜单权限和数据权限。
