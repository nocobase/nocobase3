---
title: '页面和菜单'
description: '在 client/routes.ts 里声明页面路由、配置侧边栏菜单和登录访问控制，并区分普通页面、设置页和开发页。'
keywords: 'NocoBase,页面,路由,菜单,导航,访问控制,设置页'
---

# 页面和菜单

在 NocoBase 3 的应用里，加一个页面只做两件事：在 `client/routes.ts` 里声明路由，在 `client/pages/` 里写页面组件。菜单也不用单独注册，路由上的 `navigation` 决定它出现在侧边栏的什么位置。

这些代码都在你应用的 `client/` 目录里，直接改就行，不需要做成插件。

## 声明路由和页面组件

`client/routes.ts` 是应用里声明页面的唯一入口。普通业务页面用 `defineAppRoutes()`：

```ts
// client/routes.ts
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    auth: 'required',
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

页面组件放在 `client/pages/`，并且必须 default export：

```tsx
// client/pages/orders.tsx
import type { ReactElement } from 'react';

export default function OrdersPage(): ReactElement {
  return <section className='p-6'>...</section>;
}
```

`componentLoader` 保持惰性加载。路由声明本身是同步的，这样导航才能在不下载所有页面的前提下解析出来，页面组件等到真正跳转过去时才加载。

import 路径写成 `.js`，即使文件其实是 `.tsx`。这是这个项目的模块解析方式，不是笔误。

### 路由路径是应用内部路径

不要把部署前缀写进路由。应用会被挂载到某个路径下（默认是 `/main`），运行时负责把这个前缀还原回来。路由里写 `/orders`，浏览器里打开的地址是 `/main/orders`。

## 把页面放进侧边栏

在路由上声明 `navigation`，页面就会出现在侧边栏：

```ts
// client/routes.ts
import { Home } from 'lucide-react';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'home',
    path: '/',
    auth: 'required',
    navigation: { title: 'navigation.home', icon: Home },
    componentLoader: () => import('./pages/home.js'),
  },
]);
```

`title` 是翻译 key，不是直接写的中文文案。把对应的文字加进 `client/locales/`，切换语言时菜单才会跟着变。`icon` 是一个接受 `className` 的组件，`lucide-react` 的图标可以直接用。

<!-- 需要一张侧边栏中出现「订单」菜单项的截图 -->

不写 `navigation` 的页面照样能通过 URL 打开，只是不进菜单。详情页、Tab 内容这类页面通常就不声明它。

另外，不要为了加菜单去创建 Refine resource。菜单只读路由的 `navigation`，resource 是给 CRUD 集成用的。

### 分组和子菜单

三类页面都支持递归的 `children`。分组有 `name`、`navigation` 和 `children`，没有 `componentLoader`；它的 `path` 可选，不写时只组织菜单，写了就作为子页面的路径前缀。

```ts
const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'business',
    navigation: { title: 'navigation.business' },
    children: [
      {
        name: 'orders',
        path: '/orders',
        navigation: { title: 'navigation.orders' },
        componentLoader: () => import('./pages/orders.js'),
      },
    ],
  },
]);
```

菜单目标必须是能直接打开的确定路径，所以带参数的页面和通配符页面不要声明 `navigation`。打开这类页面时，侧边栏会选中它最近的一个可见菜单项。

## 控制谁能打开

`auth` 决定页面的访问方式：

| 值         | 用在什么地方                                       |
| ---------- | -------------------------------------------------- |
| `required` | 只有登录用户能打开，根路由不写时也是这个默认值     |
| `guest`    | 登录、注册、找回密码等访客页面，已登录用户会被跳走 |
| `optional` | 登录前后都能打开，页面自己根据登录状态调整显示     |

子路由继承父级的 `auth`，不能改成别的值。设置页和开发页统一要求登录。

`auth` 只管浏览器里的导航。它不是服务端的安全边界。页面里调用的接口必须在自己的服务端路由中独立校验身份和权限，见[接口](./server-routes)。

除了 `auth`，普通 App 页面默认还会做一次权限检查：`resource` 用路由的 `name`，`action` 是 `access`。不通过时页面打不开，也会从菜单里消失。子页面只有在显式声明 `access` 时才额外检查。这套 resource 和 action 怎么配，见[权限](../capabilities/authorization)。

## 设置页和开发页

除了普通页面，还有两个独立的页面空间。

设置页用 `defineSettingsRoutes()` 声明，挂在 `/settings` 下。路径里不要重复写 `/settings`，写 `/orders` 最终就是 `/settings/orders`：

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

`access` 是加载页面之前的权限检查。被拒绝时，这个页面从导航里消失，直接打开 URL 也不会加载组件。没写 `access` 的页面对所有能进入设置中心的登录用户开放，所以敏感页面要显式声明，并在服务端执行同样的规则。

<!-- 需要一张设置页在侧边导航中出现的截图 -->

开发页用 `defineDevRoutes()` 声明，挂在 `/dev` 下，路径同样不重复写 `/dev`。它和设置页的写法完全一样，只有一点不同：**生产构建里这组页面根本不存在**，页面组件以及只被它们 import 的模块都不会进入打包产物。

开发页适合放调试面板、内部数据查看器、mock 开关这类不该出现在线上的东西。它是打包边界，不是权限边界。需要在生产环境按角色控制的页面，仍然应该做成带 `access` 的设置页，并由服务端强制执行。

:::warning 注意

设置页和开发页是两个各自独立的路径空间，同一个相对路径可以分别解析成 `/settings/orders` 和 `/dev/orders`，不会冲突。

:::

## 子页面和 Tab

页面需要 Tab、或者子页面要渲染在父页面里时，把这些页面声明成父路由的 `children`，然后在父页面组件里手动放一个 `<Outlet />`：

```tsx
// client/pages/workspace.tsx
import type { ReactElement } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

export default function Workspace(): ReactElement {
  const location = useLocation();

  // 选中哪个 Tab 由 URL 决定，不要另起一个 activeTab state
  return (
    <section className='space-y-4 p-6'>
      <nav className='flex gap-4'>
        <NavLink to={{ pathname: 'reports/42', search: location.search }}>
          报表 42
        </NavLink>
        <NavLink to={{ pathname: 'reports/43', search: location.search }}>
          报表 43
        </NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
```

Tab 的选中状态从 URL 派生，这样刷新、直接打开链接和前进后退都能回到同一个 Tab。纯分组由渲染器自动透传内容，页面必须自己放置 `<Outlet />`，框架不会替你插。

## 换掉插件提供的页面

不要为了替换一个插件的页面而重新声明它的路由。重复声明 `/login` 是冲突，不是定制。按优先级依次有这三种做法：

1. **插件选项。** 插件如果为这个页面提供了选项，就在 `client/plugins.ts` 注册它的时候传进去。
2. **Source extension。** 在 `client/extensions/<name>/extension.ts` 里扩展，这些文件会被自动发现。
3. **Route override。** 在 `client/route-overrides.ts` 里加一条。

override 只替换 `componentLoader`，路由的身份、路径、`auth` 和归属都不变。同一个路由在所有来源里只能有一个最终 override，加第二个会直接报错。

登录相关的界面已经在 `client/extensions/nocobase-auth-ui/` 下，改那份应用自己的副本，不要再加第四种机制。

## 改完怎么验证

- 页面在自己的路径上能打开，带上部署前缀的完整地址也能打开。
- 侧边栏出现菜单项，切换语言后文案正确，打开页面时对应项高亮。
- 未登录访问 `required` 页面会跳到登录页。
- 设置页的 `access` 被拒绝后从导航消失，直接打开 URL 也不会加载组件。
- 页面代码在导航时才加载，不在首屏产物里。

## 相关链接

- [总览](./overview)：这套代码分几部分，各管什么。
- [界面和样式](./components-and-styling)：页面里的组件怎么选、样式怎么走主题变量。
- [接口](./server-routes)：页面调用的服务端接口，以及它自己的安全边界。
- [多语言](./i18n)：菜单标题和页面文案怎么加翻译。
- [路由类型对照](../reference/routes)：五种路由分别挂在什么路径下。
- [主题变量](../reference/theme-tokens)：颜色、字体、字号、间距这些变量可以用哪些。
- [权限](../capabilities/authorization)：角色、菜单权限和数据权限。
