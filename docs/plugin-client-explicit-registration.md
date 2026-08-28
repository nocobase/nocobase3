# 插件 Client 显式注册方案

本文提出把 App 加载插件前端扩展的方式，从 `package.json` 的 `nocobase.plugins` 隐式发现，改为在 App 源码中显式注册。同时提出配套的代码生成命令和插件 skills 同步机制。

## 1. 为什么要改

### 1.1 现在的链路

插件侧提供三个相互独立的客户端入口，各自 default export：

| 入口                  | 注册内容                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `client/bootstrap.ts` | Refine 的 provider 和 resources：`setAuthProvider`、`setDataProvider`、`addResources` 等 |
| `client/routes.ts`    | 路由的 ID、path、auth 模式和懒加载的页面组件                                             |
| `client/providers.ts` | 包裹 React 组件树的同步 Provider 组件                                                    |

这三个入口的子路径在插件 `package.json` 的 `nocobase.plugin.client` 里声明一遍，在 `exports` 和 `publishConfig.exports` 里再各自开一条。

App 侧则是一条完全隐式的链路：

```text
app-template-default/package.json
  nocobase.plugins: { "@nocobase/app-plugin-x": { "enabled": true } }
        │
        ↓  server/plugins/resolve.ts:28  resolveAppPlugins()
   解析出每个插件的 client 三个入口的绝对路径
        │
        ↓  scripts/client-plugins.ts  Vite 插件
   字符串拼出虚拟模块 virtual:nocobase-app-client-plugins
        │
        ↓  client/index.tsx:1
   import { appClientPluginLoaders } → createAppRuntime()
```

### 1.2 问题

**`enabled: true` 不携带任何信息。** 它不说明这个插件有没有前端，也不说明它注册了什么。仓库里 13 个 `app-plugin-*` 中只有 7 个有 client 贡献，但从注册表上看不出区别。要知道答案只能跑 inspect，即由一个工具把注册表翻译成可读结果。

**没有配置的位置。** 插件想让 App 定制一个页面，现在只能走 `client/extensions/*/extension.ts` 或 `client/route-overrides.ts` 的路由覆盖机制，App 作者需要知道插件的 route ID 常量。插件无法声明「我接受一个 `loginPage` 参数」。

**多了一层字符串拼 JS 的代码生成。** `scripts/client-plugins.ts` 有 123 行，职责是把解析结果拼成一段 JS 源码文本。它没有类型检查，出错要到浏览器里才发现，而且改 `nocobase.plugins` 需要 dev 重启（靠 `scripts/dev-plugin-watches.mjs` 监听插件 package.json 触发）。

### 1.3 懒加载的实际范围

现在的懒加载只对**路由页面组件**成立。`client/runtime.ts:52` 用 `Promise.all` 把所有插件的 bootstrap / routes / providers 三个模块在首屏渲染前全部 await 完，只有 `AppClientRouteDefinition.componentLoader` 指向的页面是真懒加载。

因此改成显式 `import` 不会显著增加首屏包体，这些模块当前已在首屏加载。

## 2. 目标形态

### 2.1 App 侧

新增 `packages/app-template-default/client/plugins.ts`：

```ts
import {
  defineClientPlugins,
  type AppClientPlugins,
} from '@nocobase/app-client/plugins';
import authentication from '@nocobase/app-plugin-authentication/client/plugin';
import authorization from '@nocobase/app-plugin-authorization/client/plugin';
import dataProvider from '@nocobase/app-plugin-data-provider/client/plugin';
import install from '@nocobase/app-plugin-install/client/plugin';
import notificationProvider from '@nocobase/app-plugin-notification-provider/client/plugin';
import routesExample from '@nocobase/app-plugin-routes-example/client/plugin';

const clientPlugins: AppClientPlugins = defineClientPlugins([
  authentication(),
  authorization(),
  dataProvider(),
  install(),
  notificationProvider(),
  routesExample(),
]);

export default clientPlugins;
```

数组顺序就是 bootstrap 的执行顺序。当前 `nocobase.plugins` 的 key 顺序同样决定执行顺序（`register-plugin.mjs` 按包名排序插入），区别在于它是隐式副作用，而数组顺序是作者可见、可调整的。

### 2.2 插件侧

新增 `client/plugin.ts`，default export。现有 `client/bootstrap.ts`、`client/routes.ts`、`client/providers.ts` **完全不动**：

```ts
import {
  defineClientPlugin,
  type AppClientPluginFactory,
  type AppClientRouteComponentLoader,
} from '@nocobase/app-client/plugins';

import { AUTHENTICATION_ROUTE_IDS } from './route-contracts.js';

export interface AuthenticationClientOptions {
  readonly loginPage?: AppClientRouteComponentLoader;
}

const authentication: AppClientPluginFactory<AuthenticationClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-authentication',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    routeComponentOverrides: (options) =>
      options.loginPage
        ? [
            {
              routeId: AUTHENTICATION_ROUTE_IDS.login,
              componentLoader: options.loginPage,
            },
          ]
        : [],
  });

export default authentication;
```

`client/plugin.ts` 是注册面而非实现。App 的 `client/plugins.ts` 静态 import 每个插件的 `client/plugin`，因此 plugin 入口静态 import 的东西都会进入应用的入口 chunk。据此有一条推荐：

> **`client/plugin.ts` 尽量不要静态 import 插件的业务实现。** 三个入口用 `() => import()` 引用，类型用 `import type`。

不合适的是静态 import 组件、provider 工厂、服务类这类会牵出 React 子树或第三方依赖的模块。这类代码应当留在 `bootstrap` / `routes` / `providers` 里，由 plugin 入口通过动态 import 引用。

这条不做强制校验。「业务实现」与「轻量常量」的界线依赖语义判断，机械规则要么禁掉合理写法（禁止一切值 import 会连 `defineClientPlugin` 和路由 ID 常量一起禁掉），要么就得维护一份白名单。写进 AGENTS.md 和插件模板注释即可；真正的兜底是 code review 和构建产物体积。

### 2.3 三层职责

| 层                       | 内容                                                      | 谁写 |
| ------------------------ | --------------------------------------------------------- | ---- |
| `client/plugin.ts`       | 对外注册面：包名、三个入口的 loader、options 到贡献的映射 | 插件 |
| `client/bootstrap.ts` 等 | 实现：实际注册 Refine provider、路由定义、React Provider  | 插件 |
| `client/plugins.ts`      | 装配：注册哪些插件、按什么顺序、传什么配置                | App  |

## 3. API 设计

新增到 `packages/app-client/src/plugins.ts`。该包启用了 `isolatedDeclarations`，所有导出都需要显式类型标注，下面的签名已按此要求给出。

### 3.1 插件描述符

```ts
export interface AppClientPluginDefinition<TOptions> {
  readonly packageName: string;
  readonly bootstrap?: AppClientBootstrapLoader;
  readonly routes?: AppClientRoutesLoader;
  readonly providers?: AppClientProvidersLoader;
  /** options 到路由组件覆盖的映射。返回空数组表示这次调用没有覆盖。 */
  readonly routeComponentOverrides?: (
    options: TOptions,
  ) => readonly AppClientRouteComponentOverrideDefinition[];
}

export interface AppClientPluginRegistration {
  readonly packageName: string;
  readonly bootstrap?: AppClientBootstrapLoader;
  readonly routes?: AppClientRoutesLoader;
  readonly providers?: AppClientProvidersLoader;
  readonly routeComponentOverrides: readonly AppClientRouteComponentOverrideDefinition[];
  readonly options: unknown;
}

export type AppClientPluginFactory<TOptions> = (
  options?: TOptions,
) => AppClientPluginRegistration;

export function defineClientPlugin<TOptions = void>(
  definition: AppClientPluginDefinition<TOptions>,
): AppClientPluginFactory<TOptions>;
```

三个入口字段统一命名为 `bootstrap` / `routes` / `providers`。现有的 `AppClientPluginLoader` 和 `AppClientApplicationLoader` 使用 `loadBootstrap` / `loadRoutes` / `loadProviders`，本期一并重命名，避免同一概念存在两套名称。

涉及的改动范围：

| 文件                                         | 改动         |
| -------------------------------------------- | ------------ |
| `packages/app-client/src/plugins.ts`         | 3 个字段名   |
| `app-template-default/client/runtime.ts`     | 3 处字段访问 |
| `app-template-default/client/application.ts` | 3 行         |
| `tests/logic/client-runtime.test.ts`         | 约 15 处     |

`scripts/client-plugins.ts` 和 `tests/logic/client-plugins.test.ts` 本期删除，其中的 `loadX` 无需迁移。重命名后 `defineClientApplication` 与插件描述符使用同一套字段名。

### 3.2 options 到三类贡献的通路

bootstrap 通过 context 拿到 options（§3.4）。routes 和 providers 的入口 default export 是数组，没有天然的注入点，因此允许入口 default export 一个接受 options 的工厂函数：

```ts
export type AppClientRoutesModuleDefault =
  | readonly AppClientRouteDefinition[]
  | ((options: never) => readonly AppClientRouteDefinition[]);

export type AppClientProvidersModuleDefault =
  | readonly AppClientProviderDefinition[]
  | ((options: never) => readonly AppClientProviderDefinition[]);
```

runtime 加载后判断形态：是函数则传入该模块的 options 调用，是数组则直接使用。不需要 options 的插件保持数组形式，写法不变。

```ts
// client/routes.ts —— 需要 options 时
import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

import type { AuthorizationClientOptions } from './plugin.js';

const routes = (
  options: AuthorizationClientOptions,
): readonly AppClientRouteDefinition[] =>
  defineClientRoutes([
    ...(options.settingsPages === false ? [] : SETTINGS_ROUTES),
  ]);

export default routes;
```

```ts
// App 侧
authorization({ settingsPages: false }),
```

这一形态覆盖三类需求：

| 需求                    | 说明                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 按 options 增减路由     | 如 `authorization({ settingsPages: false })` 不注册那五条设置页路由                                                           |
| 按 options 调整路由路径 | 如统一加前缀，路径仍由插件生成，App 只提供参数                                                                                |
| 配置 Provider           | `AppClientProviderDefinition.component` 的类型是 `ComponentType<PropsWithChildren>`，不接受额外 props；工厂形态提供了闭包位置 |

`runtime.ts` 的 `isRouteDefinitions` 和 `isProviderDefinitions` 需要相应接受函数形态。§7.6 的 inspect 加载 `client/plugins.ts` 后同样持有 options，做相同判断即可。

### 3.3 装配

```ts
export interface AppClientPlugins {
  readonly plugins: readonly AppClientPluginLoader[];
  readonly routeComponentOverrides: readonly AppClientRouteComponentOverrideDefinition[];
}

export function defineClientPlugins(
  registrations: readonly AppClientPluginRegistration[],
): AppClientPlugins;
```

`defineClientPlugins` 做三件事：按顺序收集入口、合并所有插件贡献的路由覆盖、校验包名不重复（重复直接 throw，报出包名）。包名重复在当前的虚拟模块结构下不可能出现，手写 `client/plugins.ts` 则可能。

### 3.4 配置怎么到达 bootstrap

`AppClientBootstrapContext` 增加一个 `options` 字段，并泛型化：

```ts
export interface AppClientBootstrapContext<TOptions = unknown> {
  readonly appClient: AppClient;
  readonly packageName: string;
  readonly refine: AppClientRefineRegistry;
  readonly source: AppClientContributionSource;
  readonly options: TOptions;
}

export type AppClientBootstrap<TOptions = unknown> = (
  context: AppClientBootstrapContext<TOptions>,
) => void | Promise<void>;
```

新增字段，现有 bootstrap 全部忽略它即可，向后兼容。这是 `config` 类配置的落点：声明式的路由替换走 `routeComponentOverrides`，命令式的配置走 `options`。

`createAppRuntime` 在调用 bootstrap 时把 registration 上的 `options` 透传进 context。

### 3.5 App 侧接线

`client/index.tsx` 改动：

```ts
-import { appClientPluginLoaders } from 'virtual:nocobase-app-client-plugins';
+import clientPlugins from './plugins';

 const runtime = await createAppRuntime({
   application,
-  plugins: appClientPluginLoaders,
-  routeComponentOverrides,
+  plugins: clientPlugins.plugins,
+  routeComponentOverrides: [
+    ...clientPlugins.routeComponentOverrides,
+    ...routeComponentOverrides,
+  ],
   sourceExtensions,
 });
```

覆盖列表在 `index.tsx` 合并，`CreateAppRuntimeOptions` 的形状不变。备选是给它加一个 `plugins` 字段承载注册结果，语义更整齐，代价是 runtime 需要理解注册面这一层概念。

### 3.6 options 能表达什么

options 分两条通路，取决于配置生效的时机：

| 通路                      | 时机                 | 适合                                 |
| ------------------------- | -------------------- | ------------------------------------ |
| `routeComponentOverrides` | 装配期，React 渲染前 | 声明式替换：换页面组件               |
| `options` → bootstrap     | bootstrap 执行时     | 命令式配置：影响 provider 怎么被构造 |

下面三个例子都基于插件现有代码，不是假设。

#### 例一：换掉登录页（声明式，走 routeComponentOverrides）

authentication 插件自带四个页面。App 想只换登录页、保留其余三个：

```ts
// 插件侧 client/plugin.ts
export interface AuthenticationClientOptions {
  readonly loginPage?: AppClientRouteComponentLoader;
  readonly registerPage?: AppClientRouteComponentLoader;
}

const authentication: AppClientPluginFactory<AuthenticationClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-authentication',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    routeComponentOverrides: (options) => [
      ...(options.loginPage
        ? [
            {
              routeId: AUTHENTICATION_ROUTE_IDS.login,
              componentLoader: options.loginPage,
            },
          ]
        : []),
      ...(options.registerPage
        ? [
            {
              routeId: AUTHENTICATION_ROUTE_IDS.register,
              componentLoader: options.registerPage,
            },
          ]
        : []),
    ],
  });
```

```ts
// App 侧 client/plugins.ts
authentication({
  loginPage: () => import('./pages/branded-login'),
}),
```

路由的 path、auth 模式、route ID 仍归插件所有，App 只替换最终渲染的组件——这与今天 `route-overrides.ts` 的能力边界完全一致，区别只是 App 不再需要知道 `AUTHENTICATION_ROUTE_IDS.login` 这个常量。

本期模板不采用这种写法，原因见 §4。

#### 例二：通知的撤销按钮文案（命令式，走 bootstrap options）

`createNotificationProvider(options)` 已经接受 `{ undoLabel }`（见 `client/notification-provider.tsx:11`），默认 `'Undo'`。但 `client/bootstrap.ts` 调用时没有传任何东西，所以这个参数今天**没有任何办法从 App 传进去**。

```ts
// 插件侧 client/plugin.ts
export interface NotificationClientOptions {
  readonly undoLabel?: string;
}

const notificationProvider: AppClientPluginFactory<NotificationClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-notification-provider',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });
```

```ts
// 插件侧 client/bootstrap.ts —— 两行改动
-const bootstrap: AppClientBootstrap = ({ refine }) => {
-  refine.setNotificationProvider(createNotificationProvider());
+const bootstrap: AppClientBootstrap<NotificationClientOptions> = ({ refine, options }) => {
+  refine.setNotificationProvider(createNotificationProvider(options));
 };
```

```ts
// App 侧 client/plugins.ts
notificationProvider({ undoLabel: '撤销' }),
```

这说明 §3.4 的 `options` 字段并非为未来预留的抽象，它有现成的使用场景。

#### 例三：权限设置菜单的文案和图标

authorization 插件的 bootstrap 里 `addResources` 硬编码了五条菜单项，label 是英文（`'Authorization'`、`'Permission Sets'`……），icon 是固定的 lucide 组件（见 `client/bootstrap.ts:44`）。App 想改文案、换图标，或者干脆不显示这组设置入口，今天都没有位置可写。

```ts
// App 侧 client/plugins.ts
authorization({
  settingsMenu: false,          // 不注册这组 resources
}),
// 或
authorization({
  labels: { root: '权限', permissionSets: '权限集' },
}),
```

具体 API 形状由插件作者决定。**这类「插件硬编码了一个 App 想改的常量」的需求，在当前架构里没有落点，options 提供了这个落点。**

#### 汇总：App 侧最终长什么样

```ts
const clientPlugins: AppClientPlugins = defineClientPlugins([
  authentication({ loginPage: () => import('./pages/branded-login') }),
  authorization({ labels: { root: '权限' } }),
  dataProvider(),
  install(),
  notificationProvider({ undoLabel: '撤销' }),
  routesExample(),
]);
```

不需要配置的插件就是一对空括号。这一行读下来能同时看出：注册了谁、按什么顺序、各自被怎么定制过。

#### options 不能做什么

有两类需求看起来该由 options 解决，但当前机制不支持，方案**不提议**在本期实现，只登记为已知缺口：

| 需求                                 | 为什么现在做不到                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 改路由 path（`/install` → `/setup`） | `applyClientRouteComponentOverrides` 只替换 `componentLoader`，path 归插件所有。改 path 需要新机制，且要重新处理路径冲突检测。 |
| 替换 React Provider 组件             | providers 没有类似路由的覆盖机制。`AppClientProviderDefinition` 只有 name / component / 排序约束。                             |

这两条都是独立议题，与本方案正交。

## 4. options 覆盖与既有 extension 覆盖的边界

改造不修改运行时的覆盖机制。`applyClientRouteComponentOverrides` 的行为不变：同一个 routeId 被覆盖两次时 throw，不是后者胜出。

模板现在的 `client/extensions/nocobase-auth-ui/extension.ts` 覆盖了 authentication 插件的全部四条路由——login、register、forgot-password、reset-password——每条各一次，因此不冲突。

改造后 `routeComponentOverrides` 的来源从「extension 一处」变为「extension + `client/plugins.ts` 两处」，但这本身不产生冲突。实测四种情形：

| 情形                                          | 结果  |
| --------------------------------------------- | ----- |
| 当前状态：只有 extension 覆盖                 | 通过  |
| 改造后：插件暴露 `loginPage`，App 不传值      | 通过  |
| 改造后：插件暴露 `loginPage`，App 传了值      | throw |
| 传 `loginPage` 且移除 extension 的 login 覆盖 | 通过  |

冲突只在插件 plugin 入口暴露了某个页面选项、且 App 实际传值时发生，此时该路由被两个来源各覆盖一次。这是新增能力与既有配置撞车，与注册方式的改造无关。

对 authentication 这个插件，三种处理方式：

| 方案                                                          | 后果                                                                                    |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **A. 本期不在模板里使用 `loginPage`（建议）**                 | API 具备该能力，模板保持 auth-ui 扩展拥有那四条路由。用一个未被预覆盖的插件演示该能力。 |
| B. 删掉 auth-ui 扩展的覆盖，改由 `authentication({...})` 传入 | 演示效果最好，但涉及 Registry 已安装副本的所有权模型，属于另一个议题。                  |
| C. 让 options 覆盖优先于 extension 覆盖                       | 需要把 throw 改成优先级规则，会让「谁最终拥有这条路由」重新变得不可读。不建议。         |

建议选 A。throw 是正确行为，错误信息包含 routeId，可诊断。文档需要写明：**一条路由只能被覆盖一次，无论覆盖来自插件 options、`route-overrides.ts` 还是 source extension。**

### 4.1 确实要覆盖时怎么做

一条路由只能有一个覆盖来源。想用 options 覆盖一条已被 extension 占用的路由，做法是把该条从 extension 移到 `client/plugins.ts`，页面文件保持原位：

```ts
// client/extensions/nocobase-auth-ui/extension.ts —— 移除 login 这一项
defineClientRouteComponentOverrides([
  -{
    routeId: AUTHENTICATION_ROUTE_IDS.login,
    componentEntry: './client/extensions/nocobase-auth-ui/pages/login-page',
    componentLoader: () => import('./pages/login-page'),
  },
  { routeId: AUTHENTICATION_ROUTE_IDS.register /* ... */ },
  // 其余三条保留
]);
```

```ts
// client/plugins.ts
authentication({
  loginPage: () => import('./extensions/nocobase-auth-ui/pages/login-page'),
}),
```

页面文件仍在 `extensions/nocobase-auth-ui/pages/` 下，变化的只是这次覆盖由谁声明。四条全部迁移则 `extension.ts` 的覆盖数组为空，可以删除该文件。

三条覆盖路径的适用范围：

| 场景                              | 使用                                        |
| --------------------------------- | ------------------------------------------- |
| 插件 plugin 入口暴露了对应 option | options，如 `authentication({ loginPage })` |
| 插件未暴露 option                 | `route-overrides.ts` 或 source extension    |
| 同一路由想同时用两者              | 不支持，必须二选一                          |

options 不取代 `route-overrides.ts`。插件作者只会为部分页面暴露选项，其余路由仍然依赖通用覆盖机制。

### 4.2 插件覆盖其他插件的路由

`applyClientRouteComponentOverrides` 只校验 routeId 存在且未被重复覆盖，不限制覆盖来源，因此插件 plugin 入口的 `routeComponentOverrides` 可以返回针对其他插件路由的覆盖。合法用例如统一改版多个基础插件页面的 UI 插件。

启用这一能力需要同时修复 inspect 的来源显示。当前实现把任何被覆盖的路由的 `componentSource` 硬编码为 `application`：

```js
componentSource: routeComponentOverrides.some((o) => o.routeId === route.id)
  ? 'application'
  : route.source,
```

允许插件覆盖后，该字段必须改为实际来源包名，否则插件替换的页面在 inspect 中显示为应用所有，覆盖关系不可追溯。这项修改随 §7.6 的 inspect 改造一并完成。

## 5. `nocobase.plugins` 本期不能删

`nocobase.plugins` 目前同时喂着五个消费者，client 只是其中之一：

| 消费者                     | 位置                                             |
| -------------------------- | ------------------------------------------------ |
| client loaders             | `scripts/client-plugins.ts`                      |
| server bootstrap / routes  | `server/plugins/resolve.ts` → `server/app.ts:66` |
| migrations / seeds / jobs  | `server/runtime/config.ts:111`                   |
| dev 热重启 watch 范围      | `scripts/dev-plugin-watches.mjs`                 |
| build 时 `--filter` 哪些包 | `scripts/build.mjs:16`                           |

本期只摘掉第一个。删除 `nocobase.plugins` 需要先完成 server 侧的等价改造，该改造有一处额外成本：

**插件的 server 入口现在是纯文件约定解析的**（`resolve.ts:213` 按 `server/bootstrap.ts`、`server/routes/index.ts` 等候选路径探测），`package.json` 的 `exports` 里根本没有 server 子路径——`scripts/create-plugin.mjs:253` 生成的 exports 只有 client 三条。改成显式 import 后，每个插件都要补 `./server/plugin` 的 `exports` 和 `publishConfig.exports`，并且 `dev-plugin-watches.mjs` 和 `build.mjs` 需要改成从 `server/plugins.ts` 解析包名。

顺序：**client 显式注册（本期）→ server 显式注册 → 删除 `nocobase.plugins`**。

### 5.1 过渡期的一致性约束

本期结束后同一个插件有两处声明：`nocobase.plugins` 和 `client/plugins.ts`。两者可能不一致，例如插件在 `nocobase.plugins` 里 `enabled: false` 但仍在 `client/plugins.ts` 里——结果是 server 不加载而 client 加载。

提议增加一致性校验，放在 `packages/app-template-default/tests/logic/` 下的测试里（这样直接进 CI，无需新增命令）：

- `client/plugins.ts` 里的每个包，必须在 `nocobase.plugins` 里存在且 `enabled: true`——不满足则失败。
- `nocobase.plugins` 里 `enabled: true` 且提供了 client 贡献的包，应当在 `client/plugins.ts` 里——不满足则失败。

## 6. 禁用的表达

**不在数组里就是禁用。** 没有 `enabled: false` 字面量，禁用即删掉 import 和数组项两处。

本期 `nocobase.plugins` 仍在，所以 `--disabled` 仍有明确语义：

| 命令                           | `devDependencies` | `nocobase.plugins` | `client/plugins.ts`  |
| ------------------------------ | ----------------- | ------------------ | -------------------- |
| `plugin:register x`            | 加入              | `enabled: true`    | 追加 import + 数组项 |
| `plugin:register x --disabled` | 加入              | `enabled: false`   | 不写入               |
| `plugin:unregister x`          | 移除              | 移除               | 删除 import + 数组项 |

重新启用就是再跑一次 `pnpm plugin:register x`——命令幂等，已注册则原样返回并提示。

## 7. 代码生成

这是方案里唯一有实现难度的部分。

### 7.1 三种做法

| 做法                                    | 评价                                                            |
| --------------------------------------- | --------------------------------------------------------------- |
| 锚点注释 `// nocobase:plugins:start`    | 最简单，但用户格式化或重排就失效，而且在源码里留下工具痕迹。    |
| TS AST 全量重打印（`ts.createPrinter`） | 会按 printer 的风格重写整个文件，用户的注释和手写格式全部丢失。 |
| **AST 定位 + 文本 splice + prettier**   | **建议。** 只在原文的正确位置插入字符串，用户其余内容逐字保留。 |

第三种的具体做法：用 TypeScript 编译器 API 只做两件事——找到最后一条 import 声明的结束位置、找到 `defineClientPlugins([...])` 数组字面量的元素区间——然后在原始文本上做插入，最后用 App 自己解析出的 prettier 配置跑一遍格式化。

### 7.2 实现要点

提议抽出 `scripts/lib/client-plugins.mjs`，供 register / unregister / remove / inspect 共用：

```
readClientPlugins(appRoot)                              → { imports, entries, sourceText, ranges }
addClientPlugin(sourceText, {packageName, localName})    → 新的 sourceText
removeClientPlugin(sourceText, {packageName})            → 新的 sourceText
```

几个需要定死的细节：

- **本地变量名**：default export 意味着名字由工具决定。规则是包短名转 camelCase（`audit-log` → `auditLog`）。如果该标识符在文件里已被其他东西绑定，不猜测、不加后缀，直接报错并提示手动添加。
- **插入位置**：import 插在最后一条 import 之后；数组项追加到数组末尾，不排序。追加比排序更可预测，且不会打乱作者安排的 bootstrap 顺序。
- **幂等**：包名已存在则不写文件，输出 `already registered`。
- **`--dry-run`**：打印将要写入的结果，不落盘。
- **失败回滚**：沿用 `register-plugin.mjs` 现有的快照恢复模式（它已经对 `package.json` 和 `pnpm-lock.yaml` 这么做了），把 `client/plugins.ts` 一并纳入快照。
- **`client/plugins.ts` 不存在时**：生成一个只含 `defineClientPlugins([])` 的骨架文件。

### 7.3 前置依赖

根 `package.json` 需要加 `typescript: catalog:` 到 `devDependencies`。现在根上没有直接依赖，`require.resolve('typescript')` 从工作目录解析不到（只是碰巧能从 `.pnpm` 命中）。

### 7.4 需要连带改动的命令

- **`unregister-plugin.mjs`**：反向删除 import 和数组项。
- **`remove-plugin.mjs`**：现在的引用扫描只看 package.json 的依赖字段和 `nocobase.plugins`（`scripts/remove-plugin.mjs:228`）。必须扩展到扫描各 App 的 `client/plugins.ts`，否则会出现「插件已删除但 App 仍 import 它」的破坏性结果。
- **inspect**：改为加载 `client/plugins.ts`，实现方式见 §7.6。脚本已移入模板包，成为 `pnpm client:inspect`。它同时是 codegen 的验证手段：生成的代码能被加载并解析出预期贡献，即证明 codegen 正确。

### 7.5 组件用 loader 形式还是值形式

inspect 通过 `tsx` 运行，直接动态 import TS 源文件读取 default export。改造后它要 import `client/plugins.ts`，因此该文件必须能在 Vite 之外被加载。

tsx 下的加载边界：

| 模块内容                                | 结果                         |
| --------------------------------------- | ---------------------------- |
| 页面组件（含 JSX、跨包 import、无 CSS） | 通过                         |
| `import './x.css'`                      | 失败：`Unexpected token '{'` |
| `import logo from './x.png'`            | 失败                         |

CSS 只在 `client/index.tsx` 里 import 一次，页面组件本身不 import CSS，因此组件值不会让 `client/plugins.ts` 变得不可加载。inspect 目前也已经在静态 import React 组件——App 的 `client/providers.ts` 导入 `AppThemeProvider`，后者导入 `next-themes`。

**推荐 loader 形式，但不作为硬性约束。** 理由有两条：

1. **懒加载一致性。** `client/plugins.ts` 是首屏入口模块，值形式会把页面组件静态拖进它的模块图，于是该页面进入主 chunk。路由系统其余部分全是懒加载。
2. **风险边界。** 值形式让 `client/plugins.ts` 的可加载性取决于所传组件的传递依赖。页面组件今天不 import CSS，但没有机制保证将来不会——某个页面引入 `import './styles.css'` 之后，inspect 会在一个看似无关的地方失败。loader 形式消除这个耦合。

两条都是「更好」而非「必须」，所以类型上允许两种写法（`AppClientRouteComponentLoader | ComponentType`）；文档和插件模板统一用 loader 形式，AGENTS.md 说明理由。

写成值形式不会静默出错。以 `loginPage?: AppClientRouteComponentLoader` 声明时，传组件值在 `pnpm typecheck` 阶段就失败：

```text
error TS2322: Type 'ComponentType' is not assignable to type
  'AppClientRouteComponentLoader | undefined'.
  Type 'ComponentClass' provides no match for the signature
  '(): Promise<AppClientRouteComponentModule>'.
```

同一套类型也覆盖「loader 指向的模块没有 default export」。插件作者若要强制 loader，把自己的 options 类型声明成只接受 loader 即可。

### 7.6 inspect 的实现方式

改造后的 inspect 不再复刻解析逻辑，而是加载 `client/plugins.ts` 并调用 `@nocobase/app-client` 的运行时函数：

```js
const modules = (await import(path.join(appRoot, 'client/plugins.ts'))).default;
const contributions = [
  applicationContribution,
  ...(await loadPluginContributions(modules.plugins)),
];
const resolved = resolveAppClientContributions(contributions);
const routes = applyClientRouteComponentOverrides(
  resolved.routes,
  modules.routeComponentOverrides,
);
```

可行性已验证：tsx 能通过 package exports 解析到插件的 `.ts` 源文件（`@nocobase/app-plugin-authentication/client/routes` 返回 4 条路由定义），能加载新形态的 `client/plugins.ts`，能执行 options 传入的 override loader，并能直接调用 `resolveAppClientContributions` 和 `applyClientRouteComponentOverrides` 得到与运行时一致的结果。

与当前实现的区别：

|                    | 当前（451 行）                              | 改造后（471 行）             |
| ------------------ | ------------------------------------------- | ---------------------------- |
| 数据来源           | 扫 `nocobase.plugins`，逐个探测入口文件路径 | 加载 `client/plugins.ts`     |
| 解析逻辑           | 自行复刻一份                                | 调用 app-client 的运行时函数 |
| 与浏览器结果的关系 | 一致性依赖三处逻辑同时正确                  | 同一份文件、同一套函数       |

删除的部分：`loadApplicationDefinitions`、`loadDefinitions`、`formatPluginClientEntry`，以及对 `resolveAppPlugins` 的调用。`findApplicationEntry`、`loadApplicationSourceExtensions`、`loadApplicationRouteComponentOverrides` 保留——source extension 和 `route-overrides.ts` 的发现仍然是 App 目录约定，`client/plugins.ts` 不承载它们。

行数没有下降：实测改造后 471 行，与改造前的 451 行基本持平。删掉的复刻逻辑被三部分抵消：按运行时语义加载贡献（含工厂形态的 routes/providers）、`client/plugins.ts` 与 `client/application.ts` 各自的加载和校验、以及 options 与覆盖来源的呈现。

真正的收益不是行数，而是**解析逻辑不再有第二份实现**：路由与 provider 的解析、排序、冲突检测全部来自 `resolveAppClientContributions` 和 `applyClientRouteComponentOverrides`，与浏览器同源。

这个命令只处理 client 贡献。改造前它调用 `resolveAppPlugins` 后立即过滤出有 `manifest.client` 的插件，不读取任何 server 字段；改造后不再调用它，但该函数继续服务 server 侧的四个消费者（见 §5），实现不变。server 侧本期不改造，且当前没有对应的 inspect 命令。

由此，路由冲突、provider 循环依赖、重复覆盖等错误在 inspect 中以与浏览器相同的方式抛出，而不需要单独实现一套检查。

#### 入口路径的显示

当前 `route entry` 一类字段的值来自 `manifest.client`。新方式下入口是闭包，无法从中还原 specifier：`loader.toString()` 虽然包含原始字符串，但 tsx 会改写函数体，该路径不可依赖。

inspect 按约定推导即可：

```js
const entryOf = (packageName, kind) =>
  packageName === APP_PACKAGE_NAME
    ? `./client/${kind}`
    : `${packageName}/client/${kind}`;
```

仓库内七个提供 client 贡献的插件共十六个入口，全部是 `./client/<kind>`，没有例外，且 §9.2 会删除 `nocobase.plugin.client` 这一自定义入口路径的唯一途径。让每个插件再手写一份可推导的路径，只会增加一处与实际 loader 不一致的可能。

约定之外的入口不在支持范围内。若将来确有需要，届时再引入显式字段，而不是现在为假设的情况预留。

#### 输出样例

以下为按新方式实现后的输出，插件与解析函数均为真实实现：

```text
App: @nocobase/app-template-default

Bootstrap order
  1. @nocobase/app-template-default
    source: application
    entry: ./client/bootstrap
  2. @nocobase/app-plugin-authentication
    source: plugin
    entry: @nocobase/app-plugin-authentication/client/bootstrap
    options: {"loginPage":"[loader]","loginPageEntry":"./client/extensions/nocobase-auth-ui/pages/login-page"}
  3. @nocobase/app-plugin-authorization
    source: plugin
    entry: @nocobase/app-plugin-authorization/client/bootstrap
  4. @nocobase/app-plugin-data-provider
    source: plugin
    entry: @nocobase/app-plugin-data-provider/client/bootstrap
  5. @nocobase/app-plugin-notification-provider
    source: plugin
    entry: @nocobase/app-plugin-notification-provider/client/bootstrap
    options: {"undoLabel":"撤销"}

Routes
  /
    id: @nocobase/app-template-default:home
    auth: required
    route source: application
    route entry: ./client/routes
    component source: application
  /login
    id: @nocobase/app-plugin-authentication:login
    auth: guest
    route source: plugin
    route entry: @nocobase/app-plugin-authentication/client/routes
    component source: application (module options)
    component entry: ./client/extensions/nocobase-auth-ui/pages/login-page
  /install
    id: @nocobase/app-plugin-install:install
    auth: guest
    route source: plugin
    route entry: @nocobase/app-plugin-install/client/routes
    component source: plugin

Providers (outer -> inner)
  1. @nocobase/app-template-default:theme
    layer: root
    source: application
    entry: ./client/providers
  2. @nocobase/app-plugin-notification-provider:notification-host
    layer: extension
    source: plugin
    entry: @nocobase/app-plugin-notification-provider/client/providers
```

Routes 和 Providers 两段与当前输出逐字一致，因为计算它们的是同一个 `resolveAppClientContributions`。相比当前输出增加两项：

- **`options` 行**：显示 App 传给各插件的配置。当前的 inspect 无法呈现这类信息。函数值渲染为 `[loader]`，其路径信息由 `componentEntry` 承载。
- **`component source` 区分覆盖来源**：当前实现将任何被覆盖的路由硬编码为 `application`（见 §4.2），新实现标注实际来源，如 `application (module options)`。

## 8. 插件 skills 同步

### 8.1 目录约定

插件把技能放在 `.agents/skills/<skill-name>/SKILL.md`。技能目录名遵循固定格式：

```text
nocobase-<plugin-package-short-name>[-<suffix>]
```

一个插件可以提供多个技能，用后缀区分：

```text
packages/app-plugin-workflow/.agents/skills/
├── nocobase-app-plugin-workflow/          主技能
│   └── SKILL.md
└── nocobase-app-plugin-workflow-trigger/  子技能
    └── SKILL.md
```

同步到 App 后目录名原样保留：

```text
app-template-default/.agents/skills/
├── nocobase-app-plugin-authorization/
├── nocobase-app-plugin-workflow/
└── nocobase-app-plugin-workflow-trigger/
```

这个命名规则承担三个职责：

1. **前缀即归属。** `nocobase-app-plugin-workflow*` 的所有目录都属于 workflow 插件，不需要额外的索引文件来记录谁拥有什么。
2. **前缀即清理边界。** 卸载插件时按前缀删除，不需要查表。
3. **前缀即发现入口。** 需要枚举 NocoBase 提供的技能时，从 `nocobase-*` 开始扫。

同步命令校验这个格式：目录名不匹配 `nocobase-<插件短名>` 或 `nocobase-<插件短名>-<后缀>` 就报错，指出插件包名和违规目录名。这是同步机制正确性的唯一前提，必须强制。

仓库现状与此约定不符：目前唯一的 skills 在 `packages/authorization/skills/authorization-development/`，既不在 `.agents/skills/` 下，也不符合命名格式。`packages/authorization` 是库而非插件，处理方式见 §8.7。

### 8.2 同步方式：全量覆盖

**上游是唯一真相，同步即全量覆盖。** 不做 diff，不记 hash，不维护 manifest。

对每个已注册且提供 skills 的插件：

1. 枚举插件 `.agents/skills/` 下的一级目录，校验命名格式。
2. 对每个技能目录，`rm -rf` App 侧同名目录后整体复制。
3. 删除 App 侧那些以本插件前缀开头、但上游已不存在的目录（插件删掉了某个技能时的清理）。

这个模型的代价需要向 App 作者明示：

> **`.agents/skills/nocobase-*` 是同步产物，不是可编辑源码。在这些目录里做的任何修改都会在下次同步时被覆盖。**

需要定制的人应当在 `.agents/skills/` 下建一个**不以 `nocobase-` 开头**的目录，写自己的技能。同步机制只碰匹配 `nocobase-<已注册插件短名>` 前缀的目录，其余一律不动。这条要写进 App 的 AGENTS.md 和生成目录里的 README。

这与 Plugin Registry 的 materialize 是**不同的所有权模型**：

| 机制              | 所有权       | 升级行为         |
| ----------------- | ------------ | ---------------- |
| Registry 安装副本 | 安装后归应用 | 不覆盖应用的修改 |
| Skills 同步       | 始终归插件   | 全量覆盖         |

Registry 交付的是「拿去改」的源码配方，skills 交付的是「跟着插件版本走」的文档。两者所有权不同，行为不同是合理的，但不要混淆。

### 8.3 命名冲突

命名规则消解了跨插件冲突：两个插件的技能目录各带自己的插件短名前缀，不会重名。

残留的冲突场景是 App 作者自建了名为 `nocobase-app-plugin-x` 的目录，之后注册了插件 x。同步时直接覆盖，因为按约定该名字归插件所有。文档说明保留前缀即可。

### 8.4 触发方式

#### 两个执行环境

同步在两个不同的地方发生，命令不同：

| 环境                        | 命令                       | 提供者                              |
| --------------------------- | -------------------------- | ----------------------------------- |
| 本仓库（monorepo）          | `pnpm plugin:skills:sync`  | 根 `package.json` 脚本              |
| `create-app` 生成的独立应用 | `pnpm nb3 app skills:sync` | `@nocobase/nb3-cli`（bin 为 `nb3`） |

同步逻辑在 `@nocobase/nb3-cli` 的 `src/lib/skills-sync.ts`，两者共用；`scripts/lib/skills-sync.mjs` 只提供 monorepo 的插件解析（从 workspace 找），独立应用则从 `node_modules` 找。

#### monorepo 命令（主入口）

```bash
pnpm plugin:skills:sync [--app <app>] [--plugin <name>] [--dry-run]
```

- `--app`：目标应用，默认 `app-template-default`，与 `plugin:register` 一致。
- `--plugin`：只同步指定插件。省略时同步该应用已注册的全部插件。
- `--dry-run`：打印将要复制和删除的文件，不落盘。

默认同步全部而非要求指定插件，是因为应用的 skills 目录需要与其插件集合保持一致：少同步一个插件就产生一处不一致，而全量同步是幂等的。`--plugin` 用于只改了某个插件时缩短反馈时间。

无 `--force`：全量覆盖是默认且唯一行为，没有需要强制跨越的检查。

`plugin:register` 成功后自动调用（带 `--plugin` 指向刚注册的插件），`plugin:unregister` 触发前缀清理。

#### 不使用 postinstall

`create-app` 不在生成的应用里挂 postinstall。实测 pnpm 11 的行为如下：

| 场景                                     | postinstall 是否执行 |
| ---------------------------------------- | -------------------- |
| 全新 `pnpm install`                      | 执行                 |
| 改 `package.json` 里的插件版本后 install | 执行                 |
| **`pnpm update <plugin>`**               | **不执行**           |
| **monorepo 内改插件源码后 install**      | **不执行**           |
| 二次 `install` 且无任何变更              | 不执行               |
| `--ignore-scripts`（或用户全局配置该项） | 不执行               |

两个盲区恰好落在「更新插件」这件事上：`pnpm update <plugin>` 是最常用的更新命令，不触发；monorepo 内插件源码变化不经过版本号，也不触发。挂上 postinstall 只能覆盖「新装 / 换版本」，却会让人以为同步是自动的，反而更容易漏。

替代方案是 App 侧的 `pnpm plugin:update`（即 `nb3 app plugin update`），把升级插件和同步 skills 合成一步。升级本来就是一个显式动作，同步挂在它上面比挂在 install 的副作用上更可靠。`--plugin` 指定插件并可重复，省略时升级全部已注册插件。

只需要同步而不升级时，应用内跑 `pnpm plugin:skills:sync`（即 `nb3 app plugin skills sync`），本仓库内跑 `pnpm plugin:skills:sync`。

同步实现本身仍需保持健壮：找不到 `.agents/skills/` 就静默跳过（大部分插件没有技能，不该刷警告），失败只输出警告而不中断调用方。

### 8.5 产物是否进 git

同步产物**进 git**。理由是 clone 下来即可用，不依赖是否跑过 install；生成的 App 是交付给用户的，技能应当随源码一起到达。

代价是插件升级会产生 diff 噪音。这可以接受，且 diff 本身是有信息量的——它显示了这次升级带来了哪些技能变化。

### 8.6 发布相关的前置问题

插件要随包发布 skills，`package.json` 的 `files` 必须包含 `.agents`。但 `scripts/create-plugin.mjs` 生成的 package.json **完全没有 `files` 字段**——这违反了仓库根 AGENTS.md「A new package therefore … declares `files`」的规则，且直接阻塞 skills 发布。本期需要一并修复。

同一处模板生成的 `version` 是 `0.1.0`，而 AGENTS.md 要求新包从 `0.0.1` 起。这是与本方案无关的既有不一致，是否一并修正见 §10。

### 8.7 库包的 skills

`packages/authorization/skills/` 属于库而非插件，且不符合 §8.1 的位置和命名约定。库的技能是否同步进 App 属于后续议题，本期只处理插件包。

### 8.8 「哪些插件需要同步」

本期是 `client/plugins.ts` 与 `nocobase.plugins` 的并集——server-only 插件也可能带技能。server 显式注册完成后改为 `client/plugins.ts` ∪ `server/plugins.ts`。

## 9. 改动清单

### 9.1 `packages/app-client`

| 文件                     | 改动                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `src/plugins.ts`         | 新增 `defineClientPlugin` / `defineClientPlugins` 及相关类型；`AppClientBootstrapContext` 增加 `options` 并泛型化 |
| `tests/plugins.test.tsx` | 新增用例：options 传递、路由覆盖合并、重复包名报错                                                                |
| `README.md`              | 新增插件注册面一节                                                                                                |

### 9.2 各插件（6 个已注册 + 1 个未注册）

| 插件                                    | 现有 client 贡献             |
| --------------------------------------- | ---------------------------- |
| `app-plugin-authentication`             | bootstrap, routes            |
| `app-plugin-authorization`              | bootstrap, routes, providers |
| `app-plugin-data-provider`              | bootstrap                    |
| `app-plugin-install`                    | routes, providers            |
| `app-plugin-notification-provider`      | bootstrap, routes, providers |
| `app-plugin-routes-example`             | routes, providers            |
| `app-plugin-registry-example`（未注册） | routes                       |

每个插件：新增 `client/plugin.ts`；`exports` 和 `publishConfig.exports` 各加一条 `./client/plugin`。

`nocobase.plugin.client` 在本期改造后不再有消费者，建议同步删除该字段并移除 `server/plugins/resolve.ts` 里的 `readClientManifest`、`clientBootstrapEntry` / `clientRoutesEntry` / `clientProvidersEntry` 三个字段。留着一个不被读取的字段会误导后来者。这会连带修改 `tests/logic/config.test.ts` 中约 7 处断言（该文件 860–913 行）。此项可独立于主改造取舍。

### 9.3 `packages/app-template-default`

| 文件                                 | 改动                                                           |
| ------------------------------------ | -------------------------------------------------------------- |
| `client/plugins.ts`                  | 新增                                                           |
| `client/index.tsx`                   | 改为 import `./modules`，合并路由覆盖                          |
| `client/vite-env.d.ts`               | 删除 `virtual:nocobase-app-client-plugins` 的模块声明          |
| `scripts/client-plugins.ts`          | **删除**（123 行）                                             |
| `vite.config.ts`                     | 移除 `appClientPluginsPlugin` 的 import 和使用                 |
| `tests/logic/client-plugins.test.ts` | **删除**，并从 `vitest.config.ts` 的 include 列表移除          |
| `tests/logic/` 新增                  | `client/plugins.ts` 与 `nocobase.plugins` 的一致性校验（§5.1） |
| `AGENTS.md`                          | 更新注册方式说明                                               |
| `client/AGENTS.md`                   | 补充 module.ts 推荐写法和路由覆盖唯一性规则                    |
| `client/runtime.ts`                  | 字段重命名；接受工厂形态的 routes / providers                  |
| `client/application.ts`              | 字段重命名                                                     |
| `tests/logic/client-runtime.test.ts` | 字段重命名，约 15 处                                           |

路由覆盖列表在 `index.tsx` 合并，`createAppRuntime` 的签名不变。

### 9.4 根 `scripts/`

| 文件                     | 改动                                     |
| ------------------------ | ---------------------------------------- |
| `lib/client-modules.mjs` | 新增，AST 定位 + splice + prettier       |
| `lib/skills-sync.mjs`    | 新增，workspace 解析 + 复用 CLI 同步逻辑 |
| `register-plugin.mjs`    | 写入 client/plugins.ts；调用 skills sync |
| `unregister-plugin.mjs`  | 从 client/plugins.ts 移除；清理 skills   |
| `remove-plugin.mjs`      | 引用扫描扩展到 client/plugins.ts         |
| inspect（已移入模板包）  | 改为加载 client/plugins.ts               |
| `create-plugin.mjs`      | 生成 `client/plugin.ts`；补 `files` 字段 |
| `sync-skills.mjs`        | 新增，`plugin:skills:sync` 入口          |

根 `package.json`：加 `typescript: catalog:` 到 devDependencies，加 `plugin:skills:sync` 脚本。

`lib/skills-sync.mjs` 从 `@nocobase/nb3-cli` 导入同步逻辑，只保留 workspace 的插件解析。CLI 侧新增 `src/lib/skills-sync.ts`、`src/lib/plugin-update.ts`，以及 `src/commands/app/plugin/` 下的 `update.ts` 与 `skills/sync.ts`。

### 9.5 独立应用侧

| 位置                             | 改动                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- |
| `packages/cli/src/commands/app/` | 新增 `plugin/update.ts` 与 `plugin/skills/sync.ts`                     |
| `packages/create-app`            | `.agents/` 纳入生成的 `.gitignore` 白名单（不挂 postinstall，见 §8.4） |
| `packages/app-template-default`  | `files` 加入 `.agents`，使模板自带的技能随包发布                       |

### 9.6 测试与文档

`tests/scripts/` 下 `register-plugin.test.mjs`、`unregister-plugin.test.mjs`、`remove-plugin.test.mjs`、inspect 的测试随脚本移入模板包，并新增 `client-plugins.test.mjs`、`skills-sync.test.mjs`。

`docs/plugin-development-quickstart.md` 的第 2 节和第 3 节 Client 部分需要重写。

## 10. 待决项

阶段 1–5 已实现。下表记录当时的取舍与最终结果。

| #   | 议题                                                                             | 结果                                                                |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | options 里的组件，类型上只接受 loader，还是同时接受组件值？（§7.5）              | 两种都接受；文档和插件模板统一用 loader                             |
| 2   | 本期是否在模板里演示 `authentication({ loginPage })`？（§4）                     | 不演示，采用 §4 方案 A；能力已具备并有测试覆盖                      |
| 3   | 是否一并删除 `nocobase.plugin.client` 字段和 resolve.ts 的 client 解析？（§9.2） | 已删除，连同 `readClientManifest` 和三个 `client*Entry` 字段        |
| 4   | `packages/authorization/skills/` 是否迁移到 `.agents/skills/`？（§8.7）          | **未做。** 该包是库而非插件，同步范围不含库，迁移与否不影响本期机制 |
| 5   | `create-plugin.mjs` 生成的 `version` 与 AGENTS.md 要求不一致（§8.6）             | 已改为 `0.0.1`，并补上缺失的 `files` 字段（`dist` 与 `.agents`）    |

### 10.1 实现与本文的差异

本文是设计稿，以下几处最终实现与文中描述不同，以实现为准：

| 位置                | 本文                                  | 实现                                                                           |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| §7.6 inspect 行数   | 约 100 行                             | 471 行，与改造前基本持平；收益是解析逻辑不再有第二份实现                       |
| §7.6 覆盖来源标签   | `application (module options)`        | `application (plugin options)`，随 module → plugin 重命名                      |
| §8.4 独立应用命令   | `nb3 app skills:sync` + `postinstall` | 改为 `nb3 app plugin update` 与 `nb3 app plugin skills sync`；不挂 postinstall |
| §5.1 一致性校验测试 | 提议增加                              | 已实现，见 `tests/logic/client-plugin-registry.test.ts`                        |
| §7.2 codegen 位置   | `scripts/lib/client-plugins.mjs`      | 实现移到 `@nocobase/nb3-cli`，`scripts/` 只留一层薄封装（见下）                |

postinstall 经实测覆盖不到「更新插件」这条主路径，已决定不挂（§8.4）；改由 `pnpm plugin:update` 把升级与同步合并成一步，该命令已实现。

### 10.2 注册逻辑在仓库与独立 App 之间共用

本文默认注册只发生在本仓库内（`pnpm plugin:register --app <app>`）。但模板发布到 npm 之后，用户拉下来的独立 App 同样要装插件，而那里没有 workspace、没有 `packages/`、也没有根 `scripts/`。

最终实现把三处编辑的逻辑全部放进 `@nocobase/nb3-cli`：

| 逻辑                         | 位置                             |
| ---------------------------- | -------------------------------- |
| 改 `client/plugins.ts`       | `src/lib/client-plugins.ts`      |
| 改 `nocobase.plugins` 与依赖 | `src/lib/plugin-registration.ts` |
| 复制 skills                  | `src/lib/skills-sync.ts`         |

两边真正的差异只有两处，因此以参数而非分支表达：插件从哪里解析（工作区 `packages/` 对 App 的 `node_modules`），以及依赖记什么范围（`workspace:^` 对 registry 上的实际版本）。`scripts/*-plugin.mjs` 因此只保留仓库特有的部分：解析 `--app`、跑 `pnpm install`、失败时回滚 `pnpm-lock.yaml`。

`client-plugins.ts` 把 TypeScript 和 Prettier 都从目标 App 解析，而不是从 CLI 自己的依赖树，这样 App 用自己的版本和配置格式化自己的源码；Prettier 缺失时跳过格式化而不失败，TypeScript 缺失则明确报错且不写入任何文件。

对应新增命令 `nb3 app plugin register` / `unregister`，在 App 侧由 `pnpm plugin:register` / `pnpm plugin:unregister` 调用。

**顺带修掉的两个缺陷：**

- 原实现对任何插件都会往 `client/plugins.ts` 写 import，包括纯服务端插件，生成的 App 会在构建时报模块解析失败。现在两侧都按插件的 `exports["./client/plugin"]` 判断，没有该导出就跳过并明确告知。
- 移除数组里最后一个插件时会留下它带的逗号，生成 `defineClientPlugins([,])`。这是数组空位而不是空数组，长度为 1，运行时会迭代出一个 `undefined` 并在启动时崩溃。触发条件是把 App 的最后一个前端插件 unregister 掉。

## 11. 分阶段落地

| 阶段 | 内容                                                                                                   | 验证                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1    | `app-client` 的 API + 6 个插件的 `client/plugin.ts` + 模板 `client/plugins.ts` 手写接线 + 删除虚拟模块 | `pnpm --filter @nocobase/app-client check`、模板 typecheck / test / build、`pnpm app:dev` 实跑 |
| 2    | inspect 改为加载 `client/plugins.ts`（§7.6）+ 一致性校验测试                                           | `pnpm client:inspect` 输出与阶段 1 前一致                                                      |
| 3    | codegen：register / unregister / remove / create                                                       | `pnpm scripts:test`；用 `audit-log` 走一遍 create → register → unregister → remove             |
| 4    | skills 同步 + `files` 字段修复                                                                         | 新增的 `skills-sync.test.mjs`；`pnpm pack:check`                                               |
| 5    | 文档：quickstart、两份 AGENTS.md、app-client README                                                    | —                                                                                              |

阶段 1 是后续阶段的决策点：`client/plugins.ts` 手写完成后，若可读性相比 `nocobase.plugins` 没有实质提升，后续阶段的工具投入应当重新评估。

## 12. 变化小结

**得到：** App 的前端插件装配变成一个可读、可类型检查、可 diff 的源文件；插件获得了声明配置项的位置；bootstrap 顺序从隐式副作用变成显式数组顺序；`client/plugins.ts` 是真实源文件，Vite HMR 原生支持，改注册不再需要 dev 重启；少一层字符串拼 JS 的代码生成（-123 行）。

**代价：** 每个插件多一个 `client/plugin.ts` 和两条 exports；`plugin:register` 从改 JSON 变成改 TS 源码，实现复杂度显著上升；过渡期内 `nocobase.plugins` 与 `client/plugins.ts` 并存，需要一致性校验兜底。

**没有解决：** server 侧仍然隐式；`nocobase.plugins` 仍然存在；插件的 server 入口仍是文件约定而非 exports 声明。

**范围外的收获：** 注册逻辑做成了仓库与独立 App 共用的一份实现（§10.2），独立 App 因此也有了 `pnpm plugin:register` / `plugin:unregister`；同时修掉了两个缺陷——给纯服务端插件写客户端 import，以及移除最后一个插件留下数组空位。
