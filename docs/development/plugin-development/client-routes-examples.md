---
title: Client Route 最佳实践示例
description: NocoBase v3 插件中 App Route、Settings Route、导航策略、惰性页面、组件覆盖和分层测试的示例。
---

# Client Route 最佳实践示例

NocoBase v3 插件只通过一个 `client/routes.ts` entry 提供 Client Routes：

- `defineAppRoutes()` 声明普通浏览器页面；
- `defineSettingsRoutes()` 声明内置 Settings Route 下的页面；
- 两类 contribution 可以从同一个 entry 以数组导出；
- 页面通过 `componentLoader()` 惰性加载；
- Client `auth` 和 `access` 保护导航与页面加载，不能替代 Server 安全边界。

完整的四类 Route 选择见[Route 插件开发](./routes.md)。Client ServiceProvider、React Provider、
options 和 wiring 见[Client 模块选择](./client.md)。

## 先选择 App Route 还是 Settings Route

| 场景                        | API                      | 源码中的 path | 最终 App 内路径       |
| --------------------------- | ------------------------ | ------------- | --------------------- |
| 登录后的业务页面            | `defineAppRoutes()`      | `/orders`     | `/orders`             |
| 登录、注册或密码重置页面    | `defineAppRoutes()`      | `/login`      | `/login`              |
| 插件设置或管理页面          | `defineSettingsRoutes()` | `/orders`     | `/settings/orders`    |
| Settings 分组下的一个子页面 | `defineSettingsRoutes()` | `/general`    | `/settings/x/general` |

Route path 是 App 内部路径。不要写 `/main` 或其他部署 public base path；Settings
page 的 path 也不要重复 `/settings`。宿主负责在部署时恢复 public base path。

## 最小 App Route

```ts
import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    auth: 'required',
    componentLoader: () => import('./pages/orders-page.js'),
  },
]);

export default routes;
```

页面模块必须 default-export React component。`componentLoader` 保持 declaration
轻量，使页面依赖和页面级副作用只在真正导航时加载；`client:inspect` 也不会因此执行
页面代码。

### 选择 `auth`

| 值         | 使用场景                                     |
| ---------- | -------------------------------------------- |
| `required` | 只有登录用户能访问的页面；省略时也是该默认值 |
| `guest`    | 登录、注册、密码找回等访客页面               |
| `optional` | 登录前后都能访问、页面自行调整体验的页面     |

`auth` 是 Client navigation policy。页面调用的 HTTP API 仍要在对应 Server Route 中
声明并测试自己的 authentication、authorization 或协议特定安全策略。

## 最小 Settings Route

```ts
import {
  defineSettingsRoutes,
  type AppClientSettingsRoutesContribution,
} from '@nocobase/app-client/plugins';

const settings: AppClientSettingsRoutesContribution = defineSettingsRoutes([
  {
    name: 'orders',
    path: '/orders',
    navigation: { title: 'Orders' },
    access: { resource: 'orders.settings', action: 'read' },
    componentLoader: () => import('./pages/orders-settings-page.js'),
  },
]);

export default settings;
```

最终路径是 `/settings/orders`。`navigation` 使页面进入 Settings 导航；`access` 会在
页面加载前交给 Client access-control provider 检查。拒绝访问时页面从可用导航中移除，
直接 URL 也不会加载组件。没有声明 `access` 的页面对所有能进入 Settings centre 的
已登录用户开放，所以敏感 Settings 页面应显式声明稳定的 resource/action。

Settings 仍然属于 `routes`，不存在 `client/settings.ts` 或第四个 `settings` loader。

## 同一个 entry 提供 App 和 Settings Routes

```ts
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'orders',
      path: '/orders',
      auth: 'required',
      componentLoader: () => import('./pages/orders-page.js'),
    },
  ]),
  defineSettingsRoutes([
    {
      name: 'orders',
      path: '/orders',
      navigation: { title: 'Orders' },
      access: { resource: 'orders.settings', action: 'read' },
      componentLoader: () => import('./pages/orders-settings-page.js'),
    },
  ]),
];

export default routes;
```

`client/plugin.ts` 静态声明 routes；页面组件本身继续 lazy：

```ts
import routes from './routes.js';

export default defineClientPlugin({
  packageName: '@nocobase/app-plugin-orders',
  routes,
});
```

## Settings 分组

多个相关设置页可以共享一层分组。分组拥有自己的 name、path 和 navigation，children
才是实际页面；Settings groups 只嵌套一层。

```ts
defineSettingsRoutes([
  {
    name: 'orders',
    path: '/orders',
    navigation: { title: 'Orders' },
    children: [
      {
        name: 'general',
        path: '/general',
        navigation: { title: 'General' },
        access: { resource: 'orders.settings', action: 'read' },
        componentLoader: () => import('./pages/orders-general-page.js'),
      },
    ],
  },
]);
```

该页面最终位于 `/settings/orders/general`。不要把 `/orders` 合并进 child name，也不要
在 child path 中重复完整最终路径。

## 页面和 Server API 的组合

一个典型完整链路是：

```text
/orders
  → OrdersPage
  → @nocobase/app-sdk
  → GET /api/orders
  → Server authentication
  → Server authorization
  → OrderService
```

| 层面         | 所有权                                     |
| ------------ | ------------------------------------------ |
| Client Route | path、页面、导航策略、access 和惰性 loader |
| App SDK      | 请求、响应以及 App public base path        |
| Server Route | HTTP 输入输出和自己的安全策略              |
| Service      | 可复用领域逻辑                             |

Client 和 Server Routes 不会因为名称或路径相似而自动配对。页面行为测试之外，还要对
Server Route 发出匿名、无权限和允许访问的真实请求。

## 替换插件页面，而不是重复声明 Route

插件拥有 Route identity、path、auth 和默认 component。App 只需要换 UI 时，使用
`routeComponentOverrides` 或 App source extension 替换 `componentLoader`，不要复制
插件 Route。override 不改变 Route identity、path、auth 或 ownership。

```ts
const override = {
  routeId: '@nocobase/app-plugin-orders:orders',
  componentLoader: () => import('./pages/custom-orders-page.js'),
  componentEntry: './client/pages/custom-orders-page',
};
```

同一个 Route 在所有来源中只能有一个最终 override。提供 `componentEntry`，使
`client:inspect` 和后续 Agent 能定位最终页面源码。

## Provider 与 Route 的边界

Route 只声明页面入口。多个插件页面确实共享 React Context 时，才在
`client/react-providers/index.ts` 使用 `defineClientReactProviders()`；页面局部状态保留在页面内部。
`client:inspect` 会解析 Route 和 Provider contributions，但不会加载页面、渲染
Provider 或启动浏览器。

## 测试 Client Routes

Plugin test 应验证 declaration，而不是只断言文件存在：

- App Route 的 `parent`、`name`、`path` 和 `auth`；
- Settings Route 的 `parent`、最终 path 所需的相对 path、`navigation` 和 `access`；
- 实际调用 `componentLoader()` 并确认模块 default export；
- 一个 entry 同时导出 App/Settings contributions；
- 使用 options 时，factory 解析后的 Route；
- 使用 override 时，最终 component loader 和唯一所有权。

Client Route composition 发生变化，或者需要排查 Route 是否进入目标 App 时，可以运行：

```bash
pnpm --filter <target-app> client:inspect --json
```

它提供最终 Client composition 的只读快照，但不运行 ServiceProvider lifecycle、页面 loader 或 React Provider，也不验证 Route 行为。目标 App
测试继续验证真实导航、access、override、Provider 和页面行为；有 Server API 时完成
页面到真实 API 的 full-stack 闭环。

## 常见错误

- 创建 `client/settings.ts` 或 `settings` loader；
- 在 Settings path 中重复 `/settings`；
- 在插件 path 中写 `/main` 或其他 public base path；
- 静态 import 重页面而不是使用 `componentLoader`；
- 只配置 Client `auth/access`，却让 Server API 保持无保护；
- 为了换页面 UI 重复声明插件 Route；
- 把 Settings `access` 当成 Server authorization；
- 在 Route declaration 模块顶层执行启动副作用；
- 把共享 Provider 状态复制进多个页面。

返回[Route 插件开发](./routes.md)，或继续阅读[测试和验证插件](./testing.md)和
`packages/examples/app-plugin-routes-example` 的可运行四 Route 示例。
