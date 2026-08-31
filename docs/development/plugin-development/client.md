---
title: Client 模块选择
description: 面向 AI Agent 的 NocoBase v3 Client 插件模块导航，帮助在 Components、Routes、React Wrappers、ServiceProviders、config、options 和 Registry 之间选择正确所有权。
---

# Client 模块选择

Client 的基础装配是静态、可检查的声明：`config`、`serviceProviders`、`reactWrappers`、`routes` 和 `locales`。静态 import 只让声明可见，不会执行 ServiceProvider 生命周期、渲染 React Wrapper、加载页面组件或语言消息。

## 先按职责选择

| 目标                                   | 使用方式             | 继续阅读                                                 |
| -------------------------------------- | -------------------- | -------------------------------------------------------- |
| 导出可复用 UI 或 Hook                  | Component            | [Client Components](./client-components.md)              |
| 增加 App 页面或 Settings 页面          | Route                | [Client Routes](./client-routes-examples.md)             |
| 多个 Client surface 共享 React Context | React Wrapper        | [Client React Wrappers](./client-react-wrappers.md)      |
| 注册 Client Service 或执行启动期初始化 | ServiceProvider      | [Client ServiceProviders](./client-service-providers.md) |
| 声明浏览器公开配置的默认值与校验       | Client config        | 本页“config 与 options”                                  |
| 配置某次插件注册的稳定行为             | typed plugin options | 本页“config 与 options”                                  |
| 声明翻译 namespace 和按语言消息 loader | Client locales       | [插件国际化](./i18n.md)                                  |
| 向目标 App 交付可编辑源码              | Registry             | [Plugin Registry](./registry.md)                         |

不要因为组件名字包含 `Provider` 就把它归为 ServiceProvider。判断标准是所有权：参与 Container 和生命周期的是 `serviceProviders`；包裹 React tree 的是 `reactWrappers`。

## 静态插件声明

```ts
import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import serviceProviders from './providers/index.js';
import reactWrappers from './react-wrappers/index.js';
import routes from './routes.js';

const example: AppClientPluginFactory<ExampleClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-example',
    config: [exampleClientConfig],
    serviceProviders,
    reactWrappers,
    routes,
    locales,
  });

export default example;
```

`client/plugin.ts` 必须保持声明期无副作用。真正的延迟加载下沉到页面 `componentLoader()`、每种语言的 messages loader、重型 SDK 或真正可选的 Feature，不要把每个基础 contribution 再包装成动态 import。

## 装配关系

```text
config           → app.config
serviceProviders → app.container + lifecycle + app.refine
reactWrappers    → app.mount() 创建的 React tree
routes           → Router 和页面 componentLoader
locales          → locale manifest 和 message loader
```

`ClientApplication.start()` 执行 ServiceProvider lifecycle；`app.mount()` 才渲染 React Wrappers。Inspector 读取声明和可检查 metadata，但不执行 lifecycle、不渲染组件，也不加载叶子模块。

## config 与 options

两者解决不同问题：

- `config` 是部署时公开给浏览器的 Application 配置。默认值和校验由 App/Plugin 静态声明，部署值来自 SPA HTML 中的公开 JSON data block，最终通过 `app.config.get()` 读取。
- `options` 属于目标 App 对某一次插件 registration 的静态、typed 配置。它由 `defineClientPlugins([plugin(options)])` 提供，并传给该插件的 ServiceProvider context、Route/Wrapper 解析和 overrides。

不要把 secret 放入任何 Client config 或 options。需要保密的数据必须留在 Server，并通过受保护的 API 返回必要结果。

## 加载边界

| 内容                         | 加载时机                        |
| ---------------------------- | ------------------------------- |
| contribution declarations    | 静态 import，Runtime 解析前可见 |
| ServiceProvider lifecycle    | `app.start()`                   |
| React Wrapper component tree | `app.mount()`                   |
| Route page component         | 实际导航时                      |
| locale messages              | 选择或切换语言时                |
| 重型 SDK                     | 对应 Service/UI 首次实际使用时  |

## 自检

- `client/plugin.ts` 只声明 `config`、`serviceProviders`、`reactWrappers`、`routes`、`locales` 和 typed options；
- 不存在旧的 `bootstrap` Runtime field；
- 不使用含义模糊的 `providers` Runtime field；
- `client/providers/` 可以继续作为 ServiceProvider 源码目录，但公共字段始终叫 `serviceProviders`；
- React tree contribution 使用 `reactWrappers`，组件内部仍可使用 `ThemeProvider`、`I18nProvider` 等 React 名称；
- 页面组件和语言消息保持 leaf-level lazy loading；
- declaration 顶层没有网络连接、listener、timer 或注册副作用；
- 测试分别覆盖声明、ServiceProvider lifecycle、React Wrapper behavior 和 Route behavior。

返回[插件开发总览](./README.md)。
