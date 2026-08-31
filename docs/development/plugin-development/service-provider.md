---
title: ServiceProvider 生命周期与装配
description: 说明 NocoBase v3 插件 ServiceProvider 的职责、生命周期顺序、失败清理、Application 装配边界和可验证测试方式。
---

# ServiceProvider 生命周期与装配

本页深入说明插件 `ServiceProvider` 的生命周期和 Application 装配边界。先阅读
[Services、Tokens 与 ServiceProviders](./server-services-and-providers.md) 决定是否需要容器服务；只想查看对象、函数、普通值和测试替代示例时，阅读
[ServiceToken 与 ServiceContainer 示例](./service-token-examples.md)。

## Provider 只负责注册和生命周期

`ServiceProvider` 把插件拥有的服务接入 App。它不等于 Service，也不承载 Route：

```text
Service contract  描述调用者依赖的能力
ServiceToken       提供运行时 identity
Service            实现领域或运行能力
ServiceProvider    注册实现并管理生命周期
Route              处理 HTTP、认证、授权和输入输出
Application        组合插件并驱动全部 Provider
```

Provider 通常做三件事：

1. 在 `register()` 中同步注册 Token binding；
2. 在 `boot()`、`start()`、`ready()` 中准备或启动自己拥有的资源；
3. 在 `shutdown()` 中释放已经创建的资源。

不要在 Provider 构造器、`server/plugin.ts` 或其他 declaration module 顶层连接数据库、启动 worker、创建 timer 或发出网络请求。App composition 和只读 Inspector 都会 import declaration module。

## 最小 Provider

```ts
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { DefaultHeartbeatService } from '../services/heartbeat.js';
import { heartbeatServiceToken } from '../tokens.js';

export class HeartbeatProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-heartbeat';

  public override register(): void {
    this.app.container.singleton(
      heartbeatServiceToken,
      () => new DefaultHeartbeatService(),
    );
  }

  public override start(): Promise<void> {
    this.app.container.resolve(heartbeatServiceToken).start();
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.app.container.resolveIfCreated(heartbeatServiceToken)?.stop();
    return Promise.resolve();
  }
}
```

直接作为 `defineServerPlugin({ serviceProviders })` contribution 的 Provider 可以使用 `AppPluginApplication`。实现中只访问实际需要的 App 字段；测试 fixture 也只提供这些字段。不要因为 Provider 能访问整个 App，就让它承担 Route、Host 或其他插件的职责。

Provider `name` 必须稳定且在 Application 内唯一。插件只有一个 Provider 时通常使用包名；多个 Provider 时使用包名加能力后缀，例如：

```text
@nocobase/app-plugin-audit-log/storage
@nocobase/app-plugin-audit-log/retention
```

## 真实启动顺序

当前 App Server 的装配顺序是：

```text
register every Provider
→ register locale resources
→ boot every Provider
→ create and mount Route contributions
→ start every Provider
→ ready every Provider
```

Provider 生命周期本身是：

```text
register → boot → start → ready ───────── shutdown
```

同一阶段按 Provider composition order 执行；关闭按相反顺序执行：

```text
Provider A: register → boot → start → ready ───────── shutdown ③
Provider B: register → boot → start → ready ───── shutdown ②
Provider C: register → boot → start → ready ─ shutdown ①
```

Route factory 在所有 Provider 完成 `boot()` 后、`start()` 前执行。因此它可以解析已经注册并完成 boot 准备的 Token，但不应假设 Provider 已经完成 `start()` 或 `ready()`。正常 HTTP 请求会先等待 Application 完成启动。

## 各阶段职责

| 阶段       | 适合执行                                                       | 不应执行                              |
| ---------- | -------------------------------------------------------------- | ------------------------------------- |
| `register` | 同步注册 instance 或 singleton factory                         | 异步 I/O、建表、启动 timer、发请求    |
| `boot`     | 异步准备内部资源、校验必需依赖                                 | 假设其他 Provider 已完成 `start()`    |
| `start`    | 启动 worker、listener、后台连接或 timer                        | 注册新的 Token binding                |
| `ready`    | 在所有 Provider 已 start 后切换 Application 内部服务的就绪状态 | 假设外部 HTTP Host 已经监听端口       |
| `shutdown` | 停止任务、关闭连接、释放已经创建的资源                         | 用 `resolve()` 创建从未使用的惰性服务 |

未使用的生命周期方法可以省略，基类提供空实现。`ready` 只表示 Application 内部 Provider 生命周期完成，不表示外部 Host 已开始监听。

## 惰性服务和释放

`container.singleton()` 只注册 factory，第一次 `resolve()` 才创建实例。清理时优先使用：

```ts
this.app.container.resolveIfCreated(workerToken)?.stop();
```

不要写成：

```ts
this.app.container.resolve(workerToken).stop();
```

后一种写法会在 App 从未使用该服务时，先创建资源再立即关闭。`shutdown()` 还应能安全处理部分启动和启动失败。

## 启动失败与逆序清理

`boot()`、`start()` 或 `ready()` 抛错时，Provider registry 会尝试逆序 shutdown 已进入生命周期的 Providers，然后继续抛出启动错误。若启动和清理同时失败，会抛出包含两类错误的 `AggregateError`。Registry 自身的 `shutdown()` 是幂等的，多次调用共享同一个关闭过程。

这意味着 Provider 不应依赖“只有完整启动后才会调用 shutdown”。清理代码必须允许：

- Token 已注册但 singleton 尚未创建；
- `boot()` 只完成了一部分；
- 前一个 Provider 成功、后一个 Provider 失败；
- 多个 Provider 的清理分别失败。

## 在插件声明中组合

Provider constructors 是直接 Server contributions，不使用 loader：

```ts
import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const plugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-heartbeat',
  serviceProviders,
  routes,
});

export default plugin;
```

目标 App 在 `server/plugins.ts` 中显式注册插件。Application 根据 composition order 实例化 Provider；插件不自行创建 Application、Provider registry 或全局 container。

## Route 和 Job 的边界

Route factory 从 App container 解析 Token，但 Route 自己负责 HTTP method、path、authentication、authorization、输入和响应。不要让 Provider 注册 Route，也不要在 Route 中 `new` 第二份 Service。

默认 Queue Job factory 不直接获得 `ServiceContainer`。需要复用 Service 时，创建由 Provider 管理的明确 adapter，或者让 Job 调用独立、可注入的领域函数；不要依赖模块级 container。

## 测试生命周期行为

Provider 测试使用独立 `ServiceContainer` 和只包含实际依赖的 App fixture。仓库中的
`packages/app-plugin-service-provider-example/tests/provider.test.ts` 展示了完整模式。至少覆盖：

- `register()` 后 binding 存在，但 lazy singleton 尚未创建；
- 第一次 `resolve()` 创建实例，多次解析返回同一实例；
- 各生命周期阶段产生预期状态；
- `shutdown()` 不创建未使用的 singleton；
- 已创建资源被释放；
- Provider 或依赖失败时错误没有被吞掉。

不要使用 `as any` 构造测试 App。Provider 只需要少数字段时，可以声明与实现一致的窄 Application interface，让测试直接传入结构化 fixture。

`server:inspect` 最多提供 Provider owner、constructor name 和 composition order 的只读快照。它不实例化 Provider，也不能验证 binding、生命周期、失败清理或 Service 行为。

## 相关内容

- [Services、Tokens 与 ServiceProviders](./server-services-and-providers.md)
- [ServiceToken 与 ServiceContainer 示例](./service-token-examples.md)
- [Server Routes](./server-routes-examples.md)
- [Server Jobs](./server-jobs.md)
- 可运行参考：`packages/app-plugin-service-provider-example`
