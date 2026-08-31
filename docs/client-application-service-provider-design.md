---
title: Client Application 与跨端 ServiceProvider 设计
description: 设计 Client Application、ServiceContainer、ServiceProvider 和 React Provider，并统一 Client、Server Runtime 与 Plugin 的装配协议。
---

# Client Application 与跨端 ServiceProvider 设计

## 文档状态

本文记录已经实施的目标架构、关键决策和迁移边界。当前 Runtime、Plugin、默认应用、脚手架、Inspector、测试和开发文档均以本文确定的术语、所有权和生命周期为准；文中的旧名称只出现在明确标注的迁移对照或禁止示例中。

## 背景

Server 和 Client 现在都拥有真正的 `Application`：它们各自拥有 `ServiceContainer`，通过 `ServiceProvider` 注册应用级 Service，并负责 `register → boot → start → ready → shutdown` 生命周期。

迁移前 Client 的 `createApp()` 只返回 React 渲染配置，并不是真正的应用实例；旧 `providers` 实际是包裹 React 组件树的 React Provider，而 Authorization、Notification、Workflow 等非 UI 能力使用模块级单例或各自创建 API Client。这些问题促成了本次 Application ownership 和跨端 ServiceProvider 统一。

本方案解决以下问题：

- Client 增加真正的 `ClientApplication`；
- Client Application 持有从 SPA HTML JSON data block 加载并规范化得到的 `config`；
- Client Application 拥有独立的 `ServiceContainer`；
- Client 删除独立的 `bootstrap` contribution，由 ServiceProvider `boot()` 承接启动期初始化；
- Client 和 Server 统一使用 `serviceProviders` 声明 Service Provider；
- Client 原来的 React `providers` 改为 `reactProviders`；
- `defineAppRuntime()`、`defineClientPlugin()` 和 `defineServerPlugin()` 使用一致、无歧义的字段；
- 非 UI Service 和 React 组件树组合形成清晰边界；
- 消除 Client 模块级 Service singleton，支持多 Application 隔离和完整清理。

## 目标架构

Client 和 Server 采用相同的应用装配主干：

```text
Config → Runtime → Application → Activate
```

两端的 Application 都拥有 Service Container 和 Service Provider 生命周期：

```text
ClientApplication                         Server Application
├── Config                                ├── Config
├── ServiceContainer                      ├── ServiceContainer
├── ServiceProviders                      ├── ServiceProviders
├── Resolved Runtime                      ├── Resolved Runtime
├── React Providers                        ├── HTTP Routes
├── React Routes                          ├── HTTP/WebSocket boundary
├── start()/shutdown()                    └── start()/shutdown()
└── React render boundary
```

两端的激活方式不同：

```text
Client: Config → Runtime → Application → Start → Mount
Server: Config → Runtime → Application → Start
```

## 统一术语

| 术语               | 含义                                                      |
| ------------------ | --------------------------------------------------------- |
| `Application`      | 某次运行中的有状态应用实例                                |
| `config`           | Application 持有的只读、已规范化运行时配置                |
| `ServiceContainer` | Application 拥有的应用级服务作用域                        |
| `ServiceToken<T>`  | Service 在 Container 中的稳定运行时 identity              |
| `ServiceProvider`  | 注册 Service binding 并管理 Service 生命周期              |
| `serviceProviders` | Runtime 或 Plugin 中的 Service Provider contribution      |
| `React Provider`   | 接收 `children` 并包裹 Client React 组件树的组件          |
| `reactProviders`   | Client Runtime 或 Plugin 中的 React Provider contribution |
| `routes`           | Client 页面路由或 Server HTTP 路由 contribution           |

必须保持以下不变量：

```text
serviceProviders → ServiceContainer 和 Service 生命周期
reactProviders    → React 组件树组合
routes           → 应用入口和导航/HTTP surface
```

项目中仍然可以存在 React 的 `ThemeProvider`、`I18nProvider`，以及 Refine 的 `authProvider`、`dataProvider` 等名称。它们不会被重命名；只有它们在 NocoBase Client 装配协议中的角色统一称为 React Provider。

## 目标 Runtime API

### Client App Runtime

Client 的基础装配声明使用静态 import；真正需要按需加载的页面、语言文件和重型 SDK 在叶子节点动态加载：

```ts
import { createAppConfig } from './config/index.js';
import { locales } from './locales/index.js';
import { reactProviders } from './react-providers/index.js';
import { routes } from './routes/index.js';
import { serviceProviders } from './providers/index.js';

const appRuntime = defineAppRuntime({
  packageName: '@nocobase/app-template-default',
  config: createAppConfig,
  serviceProviders,
  reactProviders,
  routes,
  locales,
  plugins: clientPlugins.plugins,
});
```

Client 的 `config` 是应用级配置工厂；`serviceProviders`、`reactProviders` 和 Route definitions 是 Application 基础装配的一部分，静态 import 后在启动或首次渲染前确定。页面组件、语言消息和重型 SDK 仍然可以在实际使用时通过 `componentLoader()` 或模块内部 `import()` 按需加载。

### Client 加载和拆包边界

加载方式按“是否在首次启动时必需”划分，而不是按 contribution 目录划分。如果 `resolveAppRuntime()`、`app.start()` 或 Browser Host 首次渲染必须等待某个模块，那么把该模块包装成动态 import 只会增加启动阶段的 chunk 和异步依赖，不构成真正的按需加载。

| 内容                           | 加载方式 | 边界                                                |
| ------------------------------ | -------- | --------------------------------------------------- |
| App/Plugin config declaration  | 静态     | Runtime 解析前必须可见                              |
| `serviceProviders`             | 静态     | `app.start()` 前必须确定                            |
| `reactProviders`               | 静态     | Browser Host 首次渲染前必须确定                     |
| Route definitions              | 静态     | Runtime 组合和 Router 建立时必须可见                |
| 默认启用的 Client Plugin       | 静态     | 每次启动都参与 config 和 contribution 组合          |
| Route page component           | 动态     | 用户导航到页面时加载                                |
| 每种语言的 messages            | 动态     | 选择或切换语言时加载                                |
| 地图、编辑器、图表等重型 SDK   | 动态     | 对应 Service 或 UI 功能首次实际使用时加载           |
| 真正可选、可独立激活的 Feature | 动态     | 不属于基础启动协议，使用单独的 Feature 激活机制管理 |

默认 Client Plugin 也使用静态 registration：

```ts
import authenticationPlugin from '@nocobase/app-plugin-authentication/client';
import notificationPlugin from '@nocobase/app-plugin-notification/client';

export const clientPlugins = defineClientPlugins([
  authenticationPlugin(),
  notificationPlugin(),
]);
```

Plugin 内部继续静态引用基础 declarations，但页面组件保持按路由加载：

```ts
export const routes = defineAppRoutes([
  {
    path: '/example',
    component: componentLoader(() => import('./pages/example.js')),
  },
]);
```

语言资源使用静态 manifest 和动态 messages：

```ts
export const locales = defineClientLocales({
  'en-US': () => import('./locales/en-US.js'),
  'zh-CN': () => import('./locales/zh-CN.js'),
});
```

静态 import 只使 declaration 可见，不会提前执行 ServiceProvider 生命周期或渲染 React Provider：

```text
import declarations
  ↓
resolveAppRuntime() 规范化并冻结装配计划
  ↓
app.start() 执行 ServiceProvider 生命周期
  ↓
Browser Host 渲染 AppClientRoot 和 React Providers
```

所有 declaration module 必须保持无副作用。Service 注册只发生在 Provider `register()`；React Provider 只在 Mount 后渲染；网络连接、listener 和 timer 分别由 Provider 生命周期或 React effect 管理。

基础 contribution 不再接受这种统一的模块 loader 写法：

```ts
// Invalid old-style declaration: do not use contribution-level loaders.
defineClientPlugin({
  packageName: '@nocobase/app-plugin-example',
  serviceProviders: () => import('./providers/index.js'),
  reactProviders: () => import('./react-providers/index.js'),
  routes: () => import('./routes/index.js'),
  locales: () => import('./locales/index.js'),
});
```

动态 import 应下沉到真正延迟使用的叶子实现，而不是作为每个 contribution 字段的默认包装。

### Server App Runtime

Server 只重命名字段，不改变当前静态 declaration 协议：

```ts
const appRuntime = defineAppRuntime({
  config: createAppConfig,
  plugins,
  serviceProviders,
  routes,
});
```

Server 的 `serviceProviders` 继续是 Provider constructor 数组，不增加 loader：

```ts
interface AppRuntimeDefinition {
  readonly serviceProviders: readonly ApplicationServiceProviderConstructor[];
}
```

字段名称统一不要求 Client 和 Server 的模块加载策略完全相同。

## Client Config 来源和所有权

Client 配置的主要部署值来源是根目录 `config.yml` 中的 `client` 节点。Server 在提供 SPA `index.html` 时，只提取允许暴露给浏览器的 Client 配置，并以 JSON data block 写入 HTML；不再使用 `window.nb_config` 等可变全局变量。Server 还可以在同一公开 payload 中补充 API base URL、应用基础路径等由 Host 计算的部署值。

### 端到端配置流程

Server 配置示例：

```yaml
# config.yml

app:
  port: 3000

database:
  password: server-secret

client:
  app:
    title: My NocoBase
    locale: zh-CN

  auth:
    allowRegistration: true

  map:
    defaultZoom: 12
```

配置边界是：

```text
config.yml.client
  → Browser 可见的公开运行时配置

config.yml 的其他根节点
  → Server-only 配置，禁止写入 HTML
```

Server 在渲染或返回 SPA `index.html` 时，将 `config.yml.client` 和 Server 计算得到的其他公开部署值组成带版本的 payload，并安全序列化为 HTML data block：

```html
<script id="nocobase-runtime-config" type="application/json">
  {
    "version": 1,
    "config": {
      "app": {
        "title": "My NocoBase",
        "locale": "zh-CN"
      },
      "auth": {
        "allowRegistration": true
      },
      "map": {
        "defaultZoom": 12
      }
    }
  }
</script>
```

该 data block 只传递原始运行时配置值，不代表最终的 `app.config`。完整链路是：

```text
config.yml.client
  + Server 计算得到的公开部署值
  ↓
PublicClientConfig payload
  ↓
SPA index.html JSON data block
  ↓
resolveAppRuntime(appRuntime)
  ├── 读取并解析 data block
  ├── 校验 payload version 和基础结构
  ├── 收集 defineClientPlugin().config contributions
  ├── 调用 defineAppRuntime().config factory
  └── 合并默认值、校验并规范化运行时配置
  ↓
ResolvedAppRuntime.config
  ↓
createApp(runtime)
  ↓
ClientApplication.config
  ↓
app.config.get(...)
```

`defineAppRuntime.config` 和 `defineClientPlugin.config` 静态声明配置契约、默认值及校验规则；HTML data block 提供当前部署的动态配置值。因此，“配置声明静态加载”和“配置值运行时注入”并不冲突：

```text
App config declaration/defaults
  + Plugin config declarations/defaults
  + HTML runtime values
  ↓
只读、已校验的 app.config
```

Client entry 不读取 DOM、不解析 JSON，也不手动传递 Client config。默认 Browser config source 是 `resolveAppRuntime()` 的内部职责：

```tsx
const runtime = await resolveAppRuntime(appRuntime);
const app = createApp(runtime);

await app.start();
root.render(<AppClientRoot app={app} />);
```

只有 `resolveAppRuntime()` 的 Browser config source 可以读取 `#nocobase-runtime-config`。`ClientApplication`、ServiceProvider 和 Plugin 不能直接读取该 DOM 节点。这样 Browser Host 的传输方式不会泄漏到 Application 和 Plugin 协议中。

测试、嵌入式 Host 和多 Application 场景可以通过 resolve options 覆盖原始配置源，但仍由 `resolveAppRuntime()` 统一完成解析：

```ts
const runtime = await resolveAppRuntime(appRuntime, {
  rawConfig: testConfig,
});
```

`app.config` 是当前 Application 的只读配置快照。它可以包含 API base URL、应用基础路径、功能开关以及其他允许暴露给浏览器的配置，但不能包含 Server secret。初始化完成后不应通过修改 HTML data block 或 `app.config` 改变正在运行的 Application。

Application 和 ServiceProvider 统一通过 `app.config.get()` 读取最终配置：

```ts
const title = app.config.get('app.title');
const allowRegistration = app.config.get('auth.allowRegistration');
const defaultZoom = app.config.get('map.defaultZoom');
```

`AppClientConfig` 至少提供只读查询能力，调用方不能通过该对象修改配置：

```ts
export interface AppClientConfig {
  get<T>(path: string): T | undefined;
  get<T>(path: string, defaultValue: T): T;
  has(path: string): boolean;
}
```

ServiceProvider 不读取 HTML，也不重新合并配置：

```ts
public override boot(): Promise<void> {
  const allowRegistration = this.app.config.get(
    'auth.allowRegistration',
  );

  // Configure the owned service with the resolved value.
  return Promise.resolve();
}
```

配置在创建 Application 前完成解析；`ClientApplication.config` 和 `ResolvedAppRuntime.config` 应引用同一份只读结果。`app.start()`、Provider `boot()` 和 React render 阶段都不再改变配置结构。

### Browser Host 和安全边界

JSON data block 必须使用统一的安全序列化器，至少转义 `<`、`>`、`&`、`U+2028` 和 `U+2029`，防止配置内容提前结束 `<script>` 或改变 HTML 结构。Payload 必须包含 `version`，使 Client 能在结构不兼容时于创建 Application 前明确失败。

生产环境的静态 SPA 响应和开发环境的 Vite HTML proxy 必须经过同一个运行时 HTML 注入边界，不能出现只有生产环境能够获取 Client config 的差异。Server 可以缓存安全序列化结果或最终 HTML，但缓存失效必须与公开 Client 配置的变化保持一致。

无论来自 `config.yml.client` 还是 Server 计算值，写入 JSON data block 的内容都视为对浏览器和最终用户公开。数据库密码、签名密钥、内部 Token 等 Server secret 禁止进入该 payload。

Application config 和 Client Plugin options 是不同层次：

```text
app.config
  当前 Application 的全局运行时配置

provider context.options
  目标 App 注册某个 Plugin 时传入的局部 typed options
```

ServiceProvider 可以直接通过 `this.app.config` 读取应用配置，不需要把每个配置字段注册成 ServiceToken。

### Runtime 和 Plugin Config 对齐

与 Server 一致，Client 的 `defineAppRuntime()` 和 `defineClientPlugin()` 都提供 `config`，但职责不同：

| API                              | `config` 的职责                                                 |
| -------------------------------- | --------------------------------------------------------------- |
| `defineAppRuntime({ config })`   | 创建并加载当前 Client Application 的配置                        |
| `defineClientPlugin({ config })` | 声明该 Plugin 拥有的配置 namespace、schema、默认值和 validation |
| `ClientApplication.config`       | 暴露已经解析完成的只读 Application config                       |

Client App Runtime：

```ts
import { config } from './config/index.js';
import { reactProviders } from './react-providers/index.js';
import { routes } from './routes/index.js';
import { serviceProviders } from './providers/index.js';

defineAppRuntime({
  packageName: '@nocobase/app-template-default',
  config,
  serviceProviders,
  reactProviders,
  routes,
  plugins: clientPlugins.plugins,
});
```

Client Plugin：

```ts
import { config } from './config/index.js';
import { reactProviders } from './react-providers/index.js';
import { routes } from './routes/index.js';
import { serviceProviders } from './providers/index.js';

defineClientPlugin({
  packageName: '@nocobase/app-plugin-example',
  config,
  serviceProviders,
  reactProviders,
  routes,
});
```

`defineAppRuntime.config` 是 factory，`defineClientPlugin.config` 是 contribution 或 contribution 数组。两者静态导入轻量、无副作用的配置声明。`resolveAppRuntime()` 先汇总所有 Plugin config contributions，再把它们和 HTML JSON data block 中的运行时值一起交给 App config factory，形成最终的 `ResolvedAppRuntime.config`。

不要在声明模块中直接读取 Browser Host 数据：

```ts
// Do not read Browser Host data from a declaration module.
defineAppRuntime({
  config: JSON.parse(
    document.querySelector('#nocobase-runtime-config')?.textContent ?? '{}',
  ),
});
```

Plugin 仍然有两种不同的配置来源：

```text
app.config
  Server 注入、对当前 Application 全局可见的运行时配置

plugin options
  目标 App 注册该 Plugin 时提供的局部、强类型静态选项
```

目标 App 继续通过 Plugin factory 传递局部 options：

```ts
examplePlugin({ featureName: 'Example' });
```

ServiceProvider 在运行时分别通过 `this.app.config` 和 `this.context.options` 读取两类配置。`defineClientPlugin.config` 负责定义进入 Application config 的公共配置契约；Plugin options 负责目标 App 源码中的注册参数，两者不能相互覆盖，也不共享隐式优先级。

## ClientApplication

### 职责

`ClientApplication` 是 Client 的有状态应用实例，负责：

- 持有唯一的 `ResolvedAppRuntime`；
- 持有只读的 `AppClientConfig`；
- 创建并持有 `ServiceContainer`；
- 实例化并注册 Client Service Providers；
- 驱动 Service Provider 生命周期；
- 持有并在启动阶段 finalize `refine`；
- 形成最终可渲染的 Client 配置；
- 向 React 组件树暴露当前 Application；
- 在卸载、HMR、测试结束或 App Host 销毁时释放资源。

### 建议接口

```ts
export interface ClientApplicationOptions {
  readonly runtime: ResolvedAppRuntime;
  readonly createRenderConfig: ClientApplicationRenderConfigFactory;
}

export type ClientApplicationRenderConfigFactory = (
  app: ClientApplication,
) => AppClientRenderConfig;

export interface ClientServiceProviderContext<TOptions = unknown> {
  readonly packageName: string;
  readonly source: AppClientContributionSource;
  readonly options: TOptions;
}

export type ClientServiceProviderConstructor<TOptions = unknown> = new (
  app: ClientApplication,
  context: ClientServiceProviderContext<TOptions>,
) => ServiceProviderLifecycle;

export interface AppClientRegisteredServiceProvider {
  readonly Provider: ClientServiceProviderConstructor;
  readonly context: ClientServiceProviderContext;
}

export class ClientApplication {
  public readonly runtime: ResolvedAppRuntime;
  public readonly config: AppClientConfig;
  public readonly container: ServiceContainer;
  public readonly refine: AppClientRefineRegistry;

  public get renderConfig(): AppClientRenderConfig;

  public constructor(options: ClientApplicationOptions);

  public addServiceProvider(
    contribution: AppClientRegisteredServiceProvider,
  ): void;

  public addServiceProviders(
    contributions: readonly AppClientRegisteredServiceProvider[],
  ): void;

  public start(): Promise<void>;

  public shutdown(): Promise<void>;
}
```

`ClientApplication` 应复用 `@nocobase/service-provider` 的：

```text
ServiceContainer
ServiceProvider
ServiceProviderRegistry
ServiceProviderLifecycle
ServiceToken
```

不新增第二套 Client-only Container 或生命周期实现。

`ClientApplicationOptions` 不重复接收 `config`，因为规范化配置已经包含在 `ResolvedAppRuntime.config` 中；Application 构造时将同一个只读对象暴露为 `app.config`。这样数据流始终保持 `Config → Runtime → Application`，不会产生两份可能不一致的配置。

### Refine 所有权

`refine` 是 `ClientApplication` 的一等属性，不属于 Runtime。Client 不再定义独立的 Bootstrap context：

```ts
export class ClientApplication {
  public readonly refine: AppClientRefineRegistry;
}
```

Client ServiceProvider 通过当前 Application 配置 Refine：

```ts
public override boot(): Promise<void> {
  this.app.refine.setAuthProvider(authProvider);
  this.app.refine.setDataProvider(dataProvider);
  return Promise.resolve();
}
```

`app.refine` 在启动阶段是可配置的 registry。Application 在所有 Provider 完成 `boot()` 后将其 finalize，并拒绝后续结构性修改，然后执行 Application validation。`AppClientRoot` 从启动完成的 Application 读取最终 Refine config。Render 后需要变化的业务状态，由已经注册的 Refine Provider 自己管理，不通过再次修改 registry 完成。

### Container 所有权

Container 必须属于 Application：

```text
ResolvedAppRuntime
  描述需要装配的能力
        ↓
ClientApplication
  创建 ServiceContainer
        ↓
ServiceProviders
  注册和管理 Service
        ↓
React Providers / Components
  消费 Service
```

禁止把 Container 或当前 App Service 保存为：

- `ResolvedAppRuntime` 拥有的可变容器；
- 模块级 singleton；
- `window` 全局变量；
- 某个 Plugin 的私有全局 registry；
- React Context 自己创建的第二份 Service 实例。

每个 `ClientApplication` 必须拥有独立 Container，两个 Application 之间不能共享可变 Service 实例。

## Client 启动和关闭生命周期

### 总体顺序

推荐的 Client 启动顺序是：

```text
resolve Runtime contributions
  ↓
create ClientApplication
  ↓
instantiate all ServiceProviders
  ↓
register all ServiceProviders
  ↓
boot all ServiceProviders
  ↓
finalize app.refine
  ↓
build render config
  ↓
validate Application requirements
  ↓
start all ServiceProviders
  ↓
ready all ServiceProviders
  ↓
render React application through Browser Host
```

这与 Server 的原则一致：所有 Provider 先完成同一阶段，再进入下一阶段；shutdown 按相反顺序执行。

### `boot()` 取代 Client Bootstrap

Client 不再提供独立的 `bootstrap` contribution。原来由 Client Bootstrap 完成的启动期命令式初始化和 Refine 配置，迁移到对应 ServiceProvider 的 `boot()`；需要长期运行和清理的资源则分别放在 `start()` 与 `shutdown()`：

```text
resolveAppRuntime()
  只加载、规范化和汇总 ServiceProvider、Wrapper、Route、Locale 声明

createApp(runtime)
  创建 ClientApplication 和应用级 Service scope

app.start()
  register → boot → finalize config → validate → start → ready

Browser Host
  创建 React root，并在 app.start() 成功后渲染 AppClientRoot
```

Provider 的职责按生命周期拆分：

- `register()` 注册 Service Token 和同步应用 binding；
- `boot()` 解析依赖、完成 Refine 配置和其他无需长期运行的初始化；
- `start()` 启动 Realtime、事件监听、timer 等长期资源；
- `ready()` 表示 Client Application 内部服务可用；
- `shutdown()` 释放连接、监听器和其他资源。

因此这里不是保留 Bootstrap 并换一个入口，而是删除 Bootstrap 协议，由统一的 ServiceProvider 生命周期承接其职责。如果某项逻辑不需要 Service、Container 或生命周期，它应成为拥有方 Service 的普通方法或 React Provider/Route 的局部逻辑。

### 启动失败

以下任一阶段失败，都必须尝试逆序 shutdown 已经进入生命周期的 Provider，并继续抛出原始错误：

- Provider `boot()`；
- Application validation；
- Provider `start()`；
- Provider `ready()`。

如果启动和清理都失败，使用 `AggregateError` 保留两类错误。`ClientApplication.shutdown()` 必须幂等，并允许处理部分启动和从未解析过的 lazy singleton。

## Client ServiceProvider

### 示例

```ts
import { ServiceProvider } from '@nocobase/service-provider';

export class AuthorizationServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-authorization/client';

  public override register(): void {
    this.app.container.singleton(
      authorizationClientToken,
      (resolver) =>
        new AuthorizationClient(resolver.resolve(appApiClientToken)),
    );
  }

  public override shutdown(): Promise<void> {
    this.app.container.resolveIfCreated(authorizationClientToken)?.dispose();
    return Promise.resolve();
  }
}
```

`register()` 只同步声明 Token binding。网络请求、WebSocket 连接、事件订阅和 timer 不在构造器或 `register()` 中启动。

### 适合进入 Client Container 的能力

- App API Client；
- Authentication Client；
- Authorization Client；
- Notification Client；
- Workflow Client；
- Realtime Client；
- Event Bus；
- 需要跨 Plugin 共享、替换、测试注入或生命周期管理的浏览器 Service。

### 不适合进入 Client Container 的内容

- React 组件局部状态；
- 表单状态；
- Router 本身；
- Theme、Modal、Toast 等 React Context 组合；
- 页面 loading/error 状态；
- 只在一个模块内部使用且无替换或生命周期需求的 helper；
- 仅为了避免传参而创建的全局对象。

## React Bridge

React 组件通过一个薄的 Application Context 访问当前 Application：

```tsx
const ClientApplicationContext = createContext<ClientApplication | undefined>(
  undefined,
);

export function useClientApplication(): ClientApplication {
  const app = useContext(ClientApplicationContext);
  if (!app) {
    throw new Error(
      'useClientApplication() must be used inside AppClientRoot.',
    );
  }
  return app;
}

export function useService<T>(token: ServiceToken<T>): T {
  return useClientApplication().container.resolve(token);
}
```

React Context 只负责定位当前 Application，不重新注册或创建 Service：

```text
ClientApplication.container
  ↓
ClientApplicationContext
  ↓
useService(token)
  ↓
React Component
```

非 React 代码应显式接收具体 Service、`ServiceResolver` 或 `ClientApplication`，不能调用模块级 `getXxxClient()` 隐式寻找当前 App。

## Client Render Boundary

目标入口由 Browser Host 持有 React DOM Root。`resolveAppRuntime()` 在内部从 HTML JSON data block 获取并解析 Config；Host 创建 Application、启动 Application，再渲染 `AppClientRoot`：

```tsx
const container = document.getElementById('root');
if (!container) throw new Error('Missing application root element.');
const root = createRoot(container);

const runtime = await resolveAppRuntime(appRuntime);
const app = createApp(runtime);

await app.start();
root.render(<AppClientRoot app={app} />);
```

`ClientApplication` 不创建或持有 React DOM Root。它只负责 Application、Container、ServiceProvider 和 Refine 生命周期；Browser Host 负责目标元素、React Root、启动错误页面和 React tree 的卸载。`AppClientRoot` 是两者之间的公开桥接组件：

```tsx
root.render(<AppClientRoot app={app} />);
```

`ClientApplication.start()` 在所有 Provider 完成 `boot()` 后 finalize `app.refine`，并据此形成内部只读 `renderConfig`；通过 validation 后再继续执行 `start()` 与 `ready()`。对外只有整个启动流程完成后才能读取 `renderConfig`，启动期间不能返回部分配置。`AppClientRoot` 只消费已经启动完成的 Application。

为避免和 `app.config` 混淆，当前表示 React 渲染结果的 `AppClientConfig` 建议改名为 `AppClientRenderConfig`；其 `providers` 字段同步改名为 `reactProviders`：

```ts
export interface AppClientRenderConfig {
  readonly basename?: string;
  readonly reactProviders?: readonly AppClientReactProvider[];
  readonly routes: ReactNode;
}
```

`AppClientRenderConfig` 是内部 React render configuration，不充当 Application，也不拥有 Refine。`AppClientConfig` 专指从 HTML JSON data block 规范化得到、最终暴露为 `app.config` 的运行时配置。应用模板的 `createApp(runtime)` 返回 `ClientApplication`，并通过 `createRenderConfig(app)` 声明如何从启动完成的 Application 状态建立 `renderConfig`。`AppClientRoot` 直接从 `app.refine` 读取已经 finalize 的 Refine 配置。

React 树的总体结构：

```text
ClientApplicationContext
  ↓
BrowserRouter
  ↓
React Providers（outer → inner）
  ↓
Refine
  ↓
Routes
```

DOM `createRoot()`、`root.render()` 和 `root.unmount()` 全部由 Browser Host 实现。这与 Server Application 不负责 Node `listen()` 的边界一致，也让嵌入式 Host、测试和其他 React 容器能够直接控制自己的渲染生命周期。

启动、渲染和销毁规则：

- Host 必须在创建 Application 前验证目标元素；
- Host 只在 `app.start()` 成功后渲染 `AppClientRoot`；
- `root.unmount()` 负责触发 React effects cleanup，但不结束 ServiceProvider 生命周期；
- `app.shutdown()` 只逆序关闭 ServiceProviders，不操作 React Root；
- Host 销毁时先 `root.unmount()`，再调用 `app.shutdown()`；
- 如果 Application 已启动而 Host 渲染失败，Host 必须尝试 `app.shutdown()` 后再渲染启动错误页面。

```tsx
root.unmount();
await app.shutdown();
```

## Client Runtime 和 Contribution 类型

### Runtime Definition

Client Runtime 的基础 contribution 使用静态声明；`routes` 的页面组件和 `locales` 的语言文件仍可在声明内部按需加载：

```ts
export interface AppRuntimeDefinition {
  readonly packageName: string;
  readonly config: AppClientConfigFactory;
  readonly serviceProviders?: AppClientServiceProviders;
  readonly reactProviders?: AppClientReactProviders;
  readonly routes?: AppClientRoutes;
  readonly locales?: AppClientLocales;
  readonly basename?: string;
  readonly plugins: readonly AppClientPluginRegistration[];
  readonly routeComponentOverrides?: readonly AppClientRouteComponentOverrideDefinition[];
  readonly sourceExtensions?: readonly AppClientSourceExtension[];
  readonly validate?: AppRuntimeValidator;
}
```

配置工厂接收 `resolveAppRuntime()` 建立的 context，其中包含原始配置和所有 Client Plugin config contributions：

```ts
export interface AppClientConfigContext {
  readonly rawConfig: unknown;
  readonly configs: readonly AppClientConfigContribution[];
}

export type AppClientConfigFactory = (
  context: AppClientConfigContext,
) => AppClientConfig | Promise<AppClientConfig>;
```

基础 contribution 不再统一抽象成 loader。它们必须在 declaration module 中静态可见，便于 Runtime、Inspector 和 Agent 直接检查完整的 Application 组成：

```ts
export interface AppClientContribution<TOptions = void> {
  readonly packageName: string;
  readonly serviceProviders?: AppClientServiceProviders<TOptions>;
  readonly reactProviders?: AppClientReactProviders<TOptions>;
  readonly routes?: AppClientRoutes<TOptions>;
  readonly locales?: AppClientLocales;
  readonly options?: TOptions;
}
```

### Resolved Runtime

```ts
export interface ResolvedAppRuntime {
  readonly config: AppClientConfig;
  readonly basename: string;
  readonly i18n: I18nRuntime;
  readonly serviceProviders: readonly AppClientRegisteredServiceProvider[];
  readonly reactProviders: readonly AppClientRegisteredReactProvider[];
  readonly routes: readonly AppClientRegisteredRoute[];
  readonly settings: readonly AppClientRegisteredSetting[];
  readonly settingGroups: readonly AppClientRegisteredSettingGroup[];
  readonly validate?: AppRuntimeValidator;
}
```

这里的 Resolved Runtime 是已汇总、已规范化但尚未激活的装配计划。它携带只读 `config`、ServiceProvider constructor 及其 owner context、React Provider、Route、Locale 和 validator 声明；Refine registry、ServiceContainer 和最终 `AppClientRenderConfig` 属于 Application startup state。Runtime 不能拥有 ServiceContainer、Provider 实例、可变 Refine 状态或已经执行的 Service 副作用。

`AppRuntimeValidator` 相应调整为验证已经完成 Provider `boot()` 和 Refine finalize 的 Application，而不是验证 Runtime：

```ts
export type AppRuntimeValidator = (
  app: ClientApplication,
) => void | Promise<void>;
```

因此默认应用中的检查从 `validate(runtime)` 改为 `validate(app)`，并通过 Application 已完成组合的 Refine、Routes 等只读状态验证最终结果。

### Client 静态 Contribution

```ts
export type AppClientServiceProviders<TOptions = void> =
  | readonly ClientServiceProviderConstructor<TOptions>[]
  | ((
      options: TOptions,
    ) => readonly ClientServiceProviderConstructor<TOptions>[]);

export type AppClientReactProviders<TOptions = void> =
  | readonly AppClientReactProviderDefinition[]
  | ((options: TOptions) => readonly AppClientReactProviderDefinition[]);

export type AppClientRoutes<TOptions = void> =
  | readonly AppClientRouteDefinition[]
  | ((options: TOptions) => readonly AppClientRouteDefinition[]);

export interface AppClientLocales {
  readonly namespace: string;
  readonly resources: Readonly<Record<string, () => Promise<unknown>>>;
}
```

这些 factory 形式用于根据 Client Plugin typed options 选择 declaration。它们只能返回 constructors 或 definitions，不能在 factory 中实例化 Provider、解析 Service、渲染 React 或启动副作用。静态 import 的是 declaration/factory；真正重型的页面和语言资源仍可以在 definition 内部使用动态 `import()`。

Runtime resolution 会为每个 constructor 保留 `packageName`、contribution `source` 和同一份 resolved `options`，形成 `AppClientRegisteredServiceProvider`。Application 再以 `(app, context)` 实例化 Provider。这样 Provider 可以读取自己的 typed options，同时 Runtime 仍只保存不可变装配信息，不需要模块级变量或闭包式临时 class。

### React Provider 类型

当前 Client Provider 类型全部改为 React Provider 术语：

```text
AppClientProvider
  → AppClientReactProvider

AppClientProviderDefinition
  → AppClientReactProviderDefinition

AppClientRegisteredProvider
  → AppClientRegisteredReactProvider

AppClientProviderLayer
  → AppClientReactProviderLayer

AppClientProvidersModule
  → AppClientReactProviders

AppClientProvidersLoader
  → 删除，由静态 AppClientReactProviders 取代

defineClientProviders()
  → defineClientReactProviders()
```

建议类型：

```ts
export type AppClientReactProvider = ComponentType<PropsWithChildren>;

export type AppClientReactProviderLayer = 'root' | 'application' | 'extension';

export interface AppClientReactProviderDefinition {
  readonly name: string;
  readonly component: AppClientReactProvider;
  readonly layer?: AppClientReactProviderLayer;
  readonly before?: readonly string[];
  readonly after?: readonly string[];
}
```

现有 layer、`before`、`after`、稳定 ID、重复检测和拓扑排序规则保持不变，只重命名概念。

## defineClientPlugin()

目标 Client Plugin declaration：

```ts
const plugin = defineClientPlugin({
  packageName: '@nocobase/app-plugin-example',
  config: exampleClientConfig,
  serviceProviders,
  reactProviders,
  routes,
  locales,
});
```

目标类型增加直接的配置声明：

```ts
export interface AppClientPluginDefinition<
  TOptions = void,
> extends AppClientContribution<TOptions> {
  readonly config?:
    AppClientConfigContribution | readonly AppClientConfigContribution[];
}
```

配置 contribution 应保持轻量和无副作用，使 `resolveAppRuntime()` 可以先完成配置汇总与校验，再进入 ServiceProvider 生命周期。`AppClientPluginDefinition`、`AppClientPluginRegistration` 和 `defineClientPlugins()` 必须传递 config contributions，并分别传递 `serviceProviders` 与 `reactProviders`；不能再保留 `bootstrap` 或一个含义不明确的 `providers` contribution。

Client Plugin options 继续传递给：

```text
serviceProviders factory(options)
reactProviders factory(options)
routes factory(options)
routeComponentOverrides(options)
```

Plugin registration module 仍然必须轻量。`client/plugin.ts` 可以静态导入配置、ServiceProvider、React Provider 和 Route declaration；这些模块只能提供无副作用的结构描述。页面实现、语言文件和重型 SDK 仍应留在 `componentLoader()` 或 Service 内部的动态 import 后面。

## ServiceProvider 访问 Client Application

Client ServiceProvider 接收当前 `ClientApplication` 和自身 contribution context，因此可以读取 `app.config`、注册 Service、读取所属 Plugin options，也可以在 `boot()` 中配置 `app.refine`。它不需要独立的 Bootstrap context：

```ts
export class DataProviderServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-data-provider/client';

  public constructor(
    app: ClientApplication,
    private readonly context: ClientServiceProviderContext<DataProviderOptions>,
  ) {
    super(app);
  }

  public override boot(): Promise<void> {
    this.app.refine.setDataProvider(
      createDataProvider({
        appClient: this.app.container.resolve(appApiClientToken),
        config: this.app.config,
        options: this.context.options,
      }),
    );
    return Promise.resolve();
  }
}
```

Application 可以暴露只读 Service resolver 和 Refine registry，供 Provider 使用：

```ts
export interface ClientApplication {
  readonly config: AppClientConfig;
  readonly container: ServiceContainer;
  readonly services: ServiceResolver;
  readonly refine: AppClientRefineRegistry;
}
```

`services` 只用于解析；新的 Service binding 只能在 `serviceProviders` 的 `register()` 中声明。长期可以将当前 `@nocobase/app-sdk` 的 `AppClient` 重命名为 `AppApiClient`，避免与 `ClientApplication` 混淆；该重命名不属于本方案第一阶段的必要条件。

## defineServerPlugin()

Server Plugin 只进行显式字段重命名：

```ts
const plugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-example',
  config: exampleServerConfig,
  serviceProviders,
  routes,
  locales: () => import('./locales/index.js'),
});
```

目标类型：

```ts
export interface AppServerPluginDefinition<TConfig = object> {
  readonly packageName: string;
  readonly config?:
    AppConfigContribution<never> | readonly AppConfigContribution<never>[];
  readonly serviceProviders?: readonly AppPluginProviderConstructor<TConfig>[];
  readonly routes?: readonly AppRouteContribution<AppPluginApplication>[];
  readonly database?: AppServerPluginDatabaseContribution;
  readonly queue?: AppServerPluginQueueContribution;
  readonly locales?: AppServerPluginLocalesLoader;
}
```

以下 Server API 和内部结构同步改名：

```text
AppServerPluginDefinition.providers
  → serviceProviders

AppServerPlugin.providers
  → serviceProviders

AppRuntimeDefinition.providers
  → serviceProviders

ResolvedAppRuntime.providers
  → serviceProviders

ApplicationRuntimeContributions.providers
  → serviceProviders

Application.addProvider()
  → addServiceProvider()

Application.addProviders()
  → addServiceProviders()
```

`ServiceProviderRegistry` 和 `ServiceProvider` 通用基础类型不改名。

## Client Application Core Services

Client Application 应通过一个最先注册的核心 ServiceProvider 提供基础服务，例如 API Client：

```text
CoreClientServiceProvider
  └── appApiClientToken → AppClient
```

Plugin ServiceProvider 通过 `appApiClientToken` 依赖同一 API Client，不再各自调用 `createAppClient()`：

```ts
this.app.container.singleton(
  notificationClientToken,
  (resolver) => new NotificationClient(resolver.resolve(appApiClientToken)),
);
```

核心 Provider 必须在 Application 和 Plugin Service Providers 之前加入 registry。所有 Provider 名称在一个 Application 内必须唯一。

## @nocobase/service-provider 的浏览器契约

`@nocobase/service-provider` 是 Client 和 Server 共同依赖的底层基础包，不属于某一端的 Application 实现。它只提供环境中立的 Container、Token 和 Provider lifecycle 原语：

```text
@nocobase/service-provider
  ├── ServiceToken
  ├── ServiceContainer
  ├── ServiceProvider<TApplication>
  ├── ServiceProviderRegistry
  └── ServiceProviderLifecycle
        ↑                         ↑
ClientApplication          Server Application
```

当前 runtime source 没有依赖 Node API，但 package metadata 和 TypeScript/ESLint preset 仍然声明为 Node library。Client 使用前必须把它正式调整为跨运行时基础包：

- 检查并保持 runtime source 不依赖 `node:*`、`process`、`Buffer` 或 DOM；
- 移除只因开发工具而存在的 Node runtime engine 声明；
- 使用能生成 declaration 且不注入 Node-only 类型的环境中立 TypeScript 配置；
- 使用与环境中立源码匹配的 ESLint 配置；
- 移除不属于 runtime source 的 `@types/node` 依赖，避免 Node 类型泄漏到公共 declarations；
- 保留 Node/Vitest 测试环境，但不要把测试环境等同于包的运行时要求；
- 将它加入 `@nocobase/app-client` 的正式 runtime dependency；
- 验证 npm tarball、exports 和 declarations 可被 Browser application 消费。

推荐的包配置目标：

```text
package runtime
  → Browser + Node
  → 不声明 Node engines
  → sideEffects: false

TypeScript
  → extends @nocobase/dev-config/tsconfig/base.json
  → package-local declaration/build options
  → declaration + isolatedDeclarations + isolatedModules
  → 不注入 Node 或 DOM 专属类型

ESLint
  → environment-neutral library preset
  → 不为 src/** 默认提供 Node、DOM 或 React globals

Tests
  → 可以继续使用 Node/Vitest runner
  → 测试环境不等于发布包运行环境
```

TypeScript 直接继承 `@nocobase/dev-config/tsconfig/base.json`，再由 `packages/libs/service-provider/tsconfig.json` 本地补齐该包实际需要的类库构建选项，不新增共享 preset：

```json
{
  "extends": "@nocobase/dev-config/tsconfig/base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "declaration": true,
    "declarationMap": true,
    "isolatedDeclarations": true,
    "isolatedModules": true,
    "sourceMap": true,
    "noEmit": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

其中 `lib` 只使用 ECMAScript 标准库，不加入 `DOM`，也不配置 `types: ["node"]`。不要继续使用 `server-library.json`，也不要为了方便把整个包改成 React/DOM library。以后有多个环境中立包重复相同配置时，再单独评估是否提取共享 preset。

共享包不应依赖以下上层包或运行时概念：

```text
@nocobase/app-client
@nocobase/app-server-kit
React / Refine
ClientApplication / Server Application
DOM / HTTP / Database
```

这些依赖分别由 Client 或 Server Application 层提供。`ServiceProvider<TApplication>` 的泛型只用于让上层传入自己的 Application 类型，不让共享包反向 import 该类型。

共享包的核心实现不需要拆成 Client/Server 两套：

```text
ServiceContainer
  → ClientApplication 和 Server Application 各自 new 一个实例

ServiceProviderRegistry
  → 两端共享 register → boot → start → ready → shutdown 原语

Application
  → 分别负责自己的 Config、Refine、Routes、Mount 或 Host 集成
```

Client 接入时，`@nocobase/app-client` 必须声明正式 runtime dependency，而不是只放在 devDependency：

```json
{
  "dependencies": {
    "@nocobase/service-provider": "workspace:^"
  }
}
```

实施时至少涉及以下文件：

| 文件                                              | 调整                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/libs/service-provider/package.json`     | 删除 Node runtime engine 和不必要的 Node 类型依赖，保留跨端 exports |
| `packages/libs/service-provider/tsconfig.json`    | 从 `server-library` 切换为 `base.json` + 包内声明构建选项           |
| `packages/libs/service-provider/eslint.config.js` | 移除 Node-only 默认环境，保持 `src/**` 环境中立                     |
| `packages/libs/service-provider/vitest.config.ts` | 保留 Node test runner，不改变发布包的运行环境声明                   |
| `packages/libs/service-provider/tests/`           | 保留核心行为测试，并补足跨端 package contract 验证                  |
| `packages/app/app-client/package.json`            | 增加 `@nocobase/service-provider` 正式 runtime dependency           |
| `packages/app/app-client` 的 Application 和测试   | 创建独立 Container/Registry，并验证 Browser consumer 和实例隔离     |
| `packages/tools/dev-config`                       | 本阶段不新增 preset；只有未来出现重复需求时再单独评估               |

共享包的现有 Container 和 Registry 测试继续保留，并增加跨端消费验证：

- Browser consumer 可以解析 package exports 和 declarations；
- Client bundle 不引入 Node-only runtime dependency；
- Client 与 Server 各自创建独立的 Container，不共享 Service 实例；
- 生命周期顺序、失败清理、逆序 shutdown 和幂等行为在两端 Application 集成测试中成立。

## 文件结构

源码路径不属于 Runtime 公共协议。Plugin 和 template 可以继续使用简洁的 `providers/` 目录存放 ServiceProvider 实现，但模块必须导出语义明确的 `serviceProviders`，并传给同名 Runtime/Plugin 字段：

```ts
import { serviceProviders } from './providers/index.js';

defineClientPlugin({
  packageName: '@nocobase/app-plugin-example',
  serviceProviders,
});
```

目录名与协议名的边界是：

```text
providers/
  → Plugin/template 内部源码组织，可同时用于 Client 和 Server

serviceProviders
  → 模块 export 和 Runtime/Plugin 公共字段

react-providers/
  → Client React Provider 源码，不再使用 providers/ 表示 React 树包装
```

`providers/index.ts` 推荐使用同名导出，使内部路径简洁而公共语义明确：

```ts
import { ApiClientServiceProvider } from './api-client.js';
import { AuthenticationServiceProvider } from './authentication.js';

export const serviceProviders = [
  ApiClientServiceProvider,
  AuthenticationServiceProvider,
];
```

### Default Client App

```text
client/
  app.ts
  runtime.ts
  config/
    index.ts
  providers/
    index.ts
  react-providers/
    index.ts
  routes/
    index.ts
```

### Client Plugin

```text
client/
  index.ts
  plugin.ts
  config/
    index.ts
  providers/
    authorization.ts
    index.ts
  react-providers/
    authorization-context.tsx
    index.ts
  routes/
    index.ts
  pages/
```

### Server App 或 Plugin

```text
server/
  runtime.ts
  providers/
    index.ts
  routes/
    index.ts
```

目录名保持简洁，字段名和导出名保持精确。通过 `serviceProviders` 与 `reactProviders` 区分两类公共 contribution，而不是依赖目录名推断语义。

## Create Plugin 脚手架

推荐将 capability 调整为：

```text
client.service-providers
client.react-providers
server.service-providers
```

生成规则：

| Capability                 | 生成文件                          | 导出/Plugin 字段   |
| -------------------------- | --------------------------------- | ------------------ |
| `client.service-providers` | `client/providers/index.ts`       | `serviceProviders` |
| `client.react-providers`   | `client/react-providers/index.ts` | `reactProviders`   |
| `server.service-providers` | `server/providers/index.ts`       | `serviceProviders` |

旧 capability：

```text
client.providers
client.bootstrap
server.providers
```

不提供旧 capability alias：`client.providers`、`client.bootstrap` 和 `server.providers` 直接删除。CLI、生成结果、模板、类型、README 和测试只接受新 capability 和新术语。运行时协议不再接受 `bootstrap`，也不允许一个 `providers` 字段同时具有两种含义。

## Inspector

Client Inspector 目标输出：

```json
{
  "configs": [],
  "serviceProviders": [],
  "reactProviders": [],
  "routes": []
}
```

Server Inspector 目标输出：

```json
{
  "serviceProviders": [],
  "routes": [],
  "locales": []
}
```

Inspector 只读取 declaration facts：

- package owner；
- contribution order；
- Config namespace 和 declaration source；
- Service Provider constructor name；
- React Provider ID、layer 和顺序；
- declaration 或叶子资源 loader 的位置；
- 重复或缺失 declaration。

Inspector 不实例化 Provider、不创建 ServiceContainer、不执行 Provider lifecycle，也不渲染 Wrapper。

## 迁移策略

本方案是一次性 breaking migration，不考虑向后兼容。旧字段、旧 capability、旧类型和旧 loader 协议直接删除，不提供 deprecated alias、联合类型、运行时自动转换或双写阶段。仓库内所有生产者和消费者必须在同一次迁移中完成调整。

### 明确的语义迁移

```text
Client 旧 providers
  → reactProviders

Client 新 serviceProviders
  → Client Service Provider contributions

Server 旧 providers
  → serviceProviders
```

### Client 加载协议迁移

基础 contribution 从 module loader 改为直接 declaration：

```text
config loader/value
  → 静态 AppClientConfigFactory / AppClientConfigContribution

serviceProviders module loader
  → 静态 Provider constructor 数组或 options factory

reactProviders module loader
  → 静态 Wrapper definition 数组或 options factory

routes module loader
  → 静态 Route definitions；页面 component loader 保留

locales module loader
  → 静态 Locale manifest；各语言 messages loader 保留

默认 Plugin loader
  → 静态 AppClientPluginRegistration
```

迁移完成后，`resolveAppRuntime()` 不再为了基础装配依次等待 contribution chunks，只负责读取 Browser config、执行轻量 declaration factories、合并 Plugin contributions、排序和规范化。动态加载错误只来自真正的叶子资源，并在其实际使用边界报告。

不能把 Client `providers` 设计成联合类型，也不能通过运行时判断数组元素是 React component 还是 Service Provider：

```ts
// 禁止
providers:
  | readonly AppClientReactProviderDefinition[]
  | readonly ClientServiceProviderConstructor[];
```

迁移完成后，旧字段必须在类型检查或声明校验阶段直接失败：

```text
Client providers
Client bootstrap
Server providers
Client contribution module loaders
动态默认 Plugin loaders
```

Runtime 不识别旧字段，CLI 不接受旧 capability，Inspector 不输出旧字段名，脚手架不生成旧 API。`providers/` 目录不是旧协议，可以继续存放 ServiceProvider 源码；旧的是含义不明确的 `providers` Runtime/Plugin 字段。迁移提交必须原子更新 Runtime、Plugin、默认应用、现有插件、生成器、Inspector、测试和开发文档，不能在仓库中长期保留新旧协议并存状态。

### 现有 Client singleton 迁移优先级

优先迁移当前已经表现出应用级 Service 特征的模块：

1. App API Client；
2. Authorization Client；
3. Notification Client；
4. Workflow Client；
5. i18n Server synchronization Client；
6. Realtime 和其他长期连接；
7. 页面模块中直接创建的 `AppClient`。

每个能力由拥有它的 package 定义 Service contract、Token 和默认 Client ServiceProvider。消费者导入原始 Token，不能重新创建同名 Token。

## 实施阶段

### 阶段一：共享基础设施

涉及：

```text
packages/libs/service-provider
packages/app/app-client
```

完成：

- `@nocobase/service-provider` browser-safe package contract：删除 Node runtime 限制，TypeScript 改为继承 `base.json` 并在包内补齐声明构建选项，ESLint 移除 Node-only 默认环境，同时移除不必要的 Node 类型依赖；
- 保持 `ServiceToken`、`ServiceContainer`、`ServiceProvider`、`ServiceProviderRegistry` 和生命周期原语为 Client/Server 共享实现，不拆分 Client-only 版本；
- 将 `@nocobase/service-provider` 加入 `@nocobase/app-client` 的正式 runtime dependency，并验证 Browser exports、declarations 和 bundle；
- `ClientApplication`；
- SPA HTML JSON data block 的 Server 注入、Client 加载、规范化和 `app.config` 所有权；
- Client config factory 和 config contribution 类型；
- Client ServiceProvider constructor 类型；
- Application Context、`useClientApplication()` 和 `useService()`；
- Client Provider lifecycle 和失败清理。

### 阶段二：Client Runtime 和 Plugin 协议

涉及：

```text
packages/app/app-client/src/runtime
packages/app/app-client/src/plugins.ts
packages/app/app-client/src/config.ts
packages/app/app-client/src/app-client.tsx
```

完成：

- 静态 `serviceProviders` contribution；
- 静态 `reactProviders` contribution；
- 静态 Route declaration 和动态页面 component loader 的分层；
- 静态 Locale manifest 和动态语言 messages loader 的分层；
- 默认 Client Plugin 改为静态 registration；
- `defineAppRuntime.config` 和 `defineClientPlugin.config` 装配；
- React Provider 类型重命名；
- 删除 Bootstrap protocol，并把现有 Bootstrap 逻辑迁入对应 ServiceProvider 的 `boot()`；
- `defineClientPlugin()` 和 `defineClientPlugins()`；
- Browser Host 持有 React Root，并在 Application 启动后渲染 `AppClientRoot`；
- `AppClientRoot` 作为公开桥接组件接收 `ClientApplication`。

### 阶段三：Server 协议显式化

涉及：

```text
packages/app/app-server-kit/src/runtime
packages/app/app-server-kit/src/plugins
packages/app/app-server-kit/src/application
```

完成所有 `providers` → `serviceProviders` 的 Runtime、Plugin、Application 和 Inspector 重命名。

### 阶段四：默认应用和现有插件

涉及：

```text
packages/templates/app-template-default
packages/plugins/app-plugin-*
```

完成：

- Client React Provider contribution 迁移为 `reactProviders`；
- Client application-level singleton 迁移为 ServiceProvider；
- Client App 和默认 Client Plugin 的基础 contributions 改为静态声明；
- 页面、语言 messages 和重型 SDK 的动态 import 下沉到实际按需使用的位置；
- Server Plugin 和 Runtime 改用 `serviceProviders`；
- 更新 package exports、声明测试和消费方。

### 阶段五：生成器、Inspector 和文档

涉及：

```text
packages/tools/create-plugin
packages/templates/app-template-default/scripts
docs/development/plugin-development
相关 AGENTS.md
Plugin Skills
```

完成 capability、生成路径、JSON snapshot、示例、开发说明和 Agent 约束的同步迁移。

## 测试要求

### @nocobase/service-provider

- runtime source 不使用 `node:*`、`process`、`Buffer`、DOM、React 或其他平台专属 API；
- 公共 declarations 不引用 Node、DOM、React、ClientApplication 或 Server Application 类型；
- TypeScript 继承 `base.json`，启用 declaration、isolated declarations 和 isolated modules，且 `lib` 不包含 DOM、`types` 不包含 Node；
- package metadata 不把发布包声明为 Node-only runtime；
- `sideEffects: false` 与实际无 import-time 副作用的实现一致；
- instance、lazy singleton、缺失/重复 Token、循环依赖和失败缓存行为保持正确；
- `register → boot → start → ready` 和逆序 shutdown 行为保持正确；
- 启动与 shutdown 同时失败时保留两类错误，shutdown 保持幂等；
- npm tarball、exports 和 declarations 可以被 Node 与 Browser consumer 解析；
- `@nocobase/app-client` typecheck/build 可以直接消费该包，Browser bundle 不包含 Node-only runtime dependency。

### ClientApplication

- Runtime 解析出的配置作为同一份只读 `app.config` 暴露；
- 两个 Application 可以显式接收不同配置，不直接依赖全局 `window`；
- ServiceProvider 可以通过 `this.app.config` 读取当前应用配置；
- 每个 Application 创建独立 `ServiceContainer`；
- 两个 Application 不共享 singleton；
- Provider 名称重复时明确失败；
- Token binding 注册和 lazy singleton 行为正确；
- `register → boot → start → ready` 顺序正确；
- shutdown 按 Provider 逆序执行；
- boot、validation、start 或 ready 失败时执行清理；
- shutdown 不创建未使用的 lazy singleton；
- shutdown 幂等；
- React `useService()` 只解析当前 Application 的 Service。
- Browser Host 只在 Application ready 后渲染 `AppClientRoot`；
- `root.unmount()` 清理 React effects，`app.shutdown()` 独立且只执行一次 Provider shutdown。

### Client Runtime 和 Plugin

- Server 只把 `config.yml.client` 和其他明确公开的部署值安全写入 SPA HTML JSON data block；
- 生产静态 HTML 和开发 Vite proxy 使用相同的 Runtime Config 注入边界；
- `resolveAppRuntime()` 在 Browser Host 边界读取 JSON data block，并通过 `defineAppRuntime.config` 规范化为只读 `AppClientConfig`；
- Application 和 ServiceProvider 通过 `app.config.get()` 读取最终配置，不直接访问 DOM；
- `ResolvedAppRuntime.config` 与 `ClientApplication.config` 指向同一份规范化配置；
- Client App 和 Plugin 的 `config` contributions 都被汇总、校验并传入 Runtime config factory；
- 缺失或无效的 Browser 配置在创建 Application 前给出明确错误；
- App 和 Plugin 的静态 `serviceProviders` declarations 都被规范化；
- App 和 Plugin 的静态 `reactProviders` declarations 都被排序；
- 默认 Client Plugin 通过静态 registration 参与 Runtime 组合；
- Route declarations 静态可见，页面组件只有在导航时才加载；
- Locale manifest 静态可见，只加载当前语言的 messages；
- Plugin typed options 到达两个 factory；
- Service Provider 与 React Provider 不会相互进入错误集合；
- ServiceProviders 按 Application、Plugin registration order 装配；
- Provider `boot()` 可以解析已注册的 Service 并配置 `app.refine`；
- validation 在所有 Provider `boot()` 和 Refine finalize 完成后、Mount 前执行；
- contribution 解析、叶子资源 loader 和 Provider lifecycle 错误包含 packageName 与 contribution source；
- declaration module import 没有启动副作用。
- 旧 `providers`、`bootstrap` 和基础 contribution loader 字段不再通过类型检查或 Runtime declaration 校验；

### Server Runtime 和 Plugin

- `defineAppRuntime({ serviceProviders })` 正确冻结和解析声明；
- `defineServerPlugin({ serviceProviders })` 正确规范化声明；
- Application 装配 App 和 Plugin Service Providers；
- Server Inspector 使用 `serviceProviders`；
- 原有 Provider 生命周期和失败清理行为不回退。

### React Providers

- layer 仍为 `root → application → extension`；
- `before`、`after` 只引用同一 layer；
- 缺失依赖、重复 ID 和循环依赖明确失败；
- Wrapper 从 outer 到 inner 渲染；
- Context、effect 和 cleanup 行为通过真实 React 测试验证。

### Create Plugin 和 Inspector

- 新 capability 生成正确文件、exports 和 Plugin declaration；
- 旧 `client.providers`、`client.bootstrap` 和 `server.providers` capability 不再被 CLI 接受；
- 未选择 capability 时不生成空 entry；
- Client Inspector 分别输出 `configs`、`serviceProviders` 和 `reactProviders`；
- Server Inspector 输出 `serviceProviders`；
- Inspector 不执行 Provider lifecycle 或 React behavior。

## 验证范围

实现完成后至少按影响面运行：

```text
@nocobase/service-provider
@nocobase/app-client
@nocobase/app-server-kit
@nocobase/create-plugin
@nocobase/app-template-default
所有被迁移的 app-plugin-* packages
Hub 和其他直接消费 App Runtime 导出类型的应用
```

每个修改包运行：

```bash
pnpm --filter <package> lint
pnpm --filter <package> typecheck
pnpm --filter <package> test
pnpm --filter <package> build
```

依赖发生变化后运行：

```bash
CI=true pnpm install --no-frozen-lockfile
```

并同步验证：

- `@nocobase/service-provider` 的 Browser/Node 双端 consumer 验证；
- Client 和 Server Inspector；
- Default App Client/Server inspect；
- Create Plugin scaffold tests；
- publish-ready exports 和 declarations；
- Browser bundle 中没有 Node-only runtime dependency。

## 验收标准

方案实现完成需要同时满足：

1. Client 和 Server 都有真正的 Application 和独立 ServiceContainer；
2. Server 将 `config.yml.client` 作为安全 JSON data block 嵌入 SPA HTML，Client 由 `resolveAppRuntime()` 读取并规范化，最终由 `ClientApplication.config` 持有且通过 `app.config.get()` 使用；
3. 两端 Runtime 和 Plugin 统一使用 `serviceProviders`；
4. Client React 组件树 contribution 统一使用 `reactProviders`；
5. `ClientApplication.start()` 完成 ServiceProvider `boot()`、Refine finalize、validation、`start()` 和 `ready()` 后，Browser Host 才渲染 `AppClientRoot`；
6. Client Application 可以独立 shutdown，且不会泄露 listener、timer、connection 或模块级 singleton；
7. 当前 Authorization、Notification、Workflow 等应用级 Client Service 不再依赖模块级全局实例；
8. 脚手架、Inspector、模板、文档、AGENTS.md 和测试全部使用新术语；
9. `@nocobase/service-provider` 的发布契约明确支持 Browser 和 Server，且共享实现不依赖任一端的 Application 或平台 API；
10. 不提供旧字段、旧 capability、旧 loader 协议或 deprecated alias；仓库内所有生产者和消费者完成一次性原子迁移；
11. Client 基础 contribution 和默认 Plugin 使用静态声明，动态 import 只保留在真正按需使用的页面、语言资源、重型 SDK 或独立 Feature 边界；
12. Client、Server、Default App 和所有直接消费方通过 lint、typecheck、test 和 build。

## 最终协议摘要

```ts
// Client App Runtime
import { config } from './config/index.js';
import { locales } from './locales/index.js';
import { reactProviders } from './react-providers/index.js';
import { routes } from './routes/index.js';
import { serviceProviders } from './providers/index.js';

defineAppRuntime({
  packageName: '@nocobase/app-template-default',
  config,
  serviceProviders,
  reactProviders,
  routes,
  locales,
});
```

```ts
// Client Plugin
import { config } from './config/index.js';
import { locales } from './locales/index.js';
import { reactProviders } from './react-providers/index.js';
import { routes } from './routes/index.js';
import { serviceProviders } from './providers/index.js';

defineClientPlugin({
  packageName: '@nocobase/app-plugin-example',
  config,
  serviceProviders,
  reactProviders,
  routes,
  locales,
});
```

```ts
// Server App Runtime
defineAppRuntime({
  config: createAppConfig,
  plugins,
  serviceProviders,
  routes,
});
```

```ts
// Server Plugin
defineServerPlugin({
  packageName: '@nocobase/app-plugin-example',
  config: exampleServerConfig,
  serviceProviders,
  routes,
});
```

```tsx
// Client entry
const root = createRoot(container);
const runtime = await resolveAppRuntime(appRuntime);
const app = createApp(runtime);

await app.start();
root.render(<AppClientRoot app={app} />);
```

最终的跨端规则有三条：

```text
Config belongs to Application and is read through app.config.
Service belongs to Application and is registered by serviceProviders.
React tree composition belongs to the Client and is declared by reactProviders.
```
