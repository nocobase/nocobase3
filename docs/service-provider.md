---
title: Service Provider
description: NocoBase V3 服务容器、Service Provider 生命周期，以及插件注册和使用服务的完整开发指南
---

# Service Provider

Service Provider 是 NocoBase V3 Server 注册服务、组织依赖和管理生命周期的标准入口。它把“应用启用了哪些能力”与“能力如何创建、启动和释放”分开：Application 负责组合，Provider 负责自己拥有的服务。

一个典型调用链如下：

```text
Application
  ├── addProvider(PluginProvider)
  ├── container: ServiceContainer
  └── Provider lifecycle
      ├── register  注册 ServiceToken 与服务工厂
      ├── boot      完成异步初始化
      ├── start     启动服务
      ├── ready     确认服务已经可用
      └── shutdown  逆序停止并释放服务

Plugin route
  └── app.container.resolve(serviceToken)
      └── Service
```

Service Provider 不等同于 Service，也不承载 HTTP Router 本身：

- **Service** 实现可被其他模块调用的能力，例如 Cache、Queue、Realtime 或领域服务；
- **ServiceToken** 是服务的稳定、类型安全标识；
- **ServiceContainer** 保存 Token 到实例或单例工厂的绑定，并负责解析依赖；
- **ServiceProvider** 声明绑定，并把服务接入 Application 生命周期；
- **Application** 是组合根，持有配置、路径、容器和全部 Provider；
- **Route** 是 HTTP 边界，从容器解析服务，不负责创建或释放服务。

## 为什么使用 Service Provider

如果服务在 `app.ts`、Route 或 Host Adapter 中直接创建，配置读取、依赖组装和资源释放会逐渐散落到不同入口。Service Provider 把这些职责收回到能力所有者：

- standalone、embedded，以及后续 Koa、Fastify 等 Host Adapter 共用同一套生命周期；
- 插件只声明自己的服务，不需要修改 Application 核心；
- 服务通过 Token 解耦，消费方不依赖实例创建细节；
- 单例默认惰性创建，未使用的能力不会仅因注册而实例化；
- 启动失败时可以统一回收已进入生命周期的 Provider；
- 测试可以只创建 `ServiceContainer` 和 Provider，不必启动 HTTP Server。

## 核心概念

### ServiceToken

不要用字符串或属性名直接访问服务。每项可共享能力都应由能力所有者导出一个类型化 Token：

```ts
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { HeartbeatService } from './service.js';

export const heartbeatServiceToken: ServiceToken<HeartbeatService> =
  createServiceToken<HeartbeatService>(
    '@nocobase/app-plugin-service-provider-example/heartbeat',
  );
```

Token 名称应全局稳定且容易定位。插件通常使用“包名/能力名”，例如 `@nocobase/app-plugin-audit-log/writer`。

泛型把 Token 和服务类型绑定起来，因此：

```ts
const heartbeat = app.container.resolve(heartbeatServiceToken);
```

会直接得到 `HeartbeatService`，不需要类型断言。

`ServiceToken<T>` 不要求服务必须由 class 实现。函数、普通对象、普通值以及同一类型的不同业务角色也可以注册为服务，参见 [ServiceToken 简易示例](./service-token-examples.md)。

### ServiceContainer

`ServiceContainer` 提供两种注册方式：

```ts
const heartbeat = new HeartbeatService();
container.instance(heartbeatServiceToken, heartbeat);

container.singleton(databaseToken, (resolver) => {
  const logger = resolver.resolve(loggerToken);
  return new DatabaseService(logger);
});
```

- `instance(token, object)`：注册已经创建好的对象实例；
- `singleton(token, factory)`：注册惰性单例工厂，第一次 `resolve()` 时只创建一次；
- `resolve(token)`：解析服务；未注册、重复注册或出现循环依赖时抛出明确错误；
- `has(token)`：判断是否存在绑定；
- `resolveIfCreated(token)`：只返回已经创建的单例，不触发惰性创建。

服务之间的依赖应在单例工厂中通过 `resolver` 解析，而不是从模块级全局变量获取：

```ts
this.app.container.singleton(reportServiceToken, (resolver) => {
  return new ReportService(
    resolver.resolve(databaseManagerToken),
    resolver.resolve(loggingToken),
  );
});
```

### ServiceProvider

Provider 是一个 class，并以 `ServiceProvider<TApplication>` 为基类。`this.app` 是当前真实 Application，但 Provider 只需声明自己使用的最小结构：

```ts
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

interface AuditLogProviderApplication {
  readonly container: ServiceContainer;
}

export default class AuditLogProvider extends ServiceProvider<AuditLogProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-audit-log';
}
```

这种窄接口让依赖对人和 Agent 都更明确：只需要容器的 Provider 不应声明整个应用配置；需要配置时再加入准确字段：

```ts
interface AuditLogProviderApplication {
  readonly config: {
    readonly auditLog: {
      readonly retentionDays: number;
    };
  };
  readonly container: ServiceContainer;
}
```

Provider 使用 `this.app.container`，不使用 `this.context.serviceContainer`、`this.app.services` 或模块级容器。

### 从 deps/bootstrap 迁移

旧插件如果使用 `server/bootstrap.ts`、`deps` 和可变的 `services` 对象，迁移时按职责拆分：

- `server/bootstrap.ts` 改为默认导出 Provider class 的 `server/provider.ts`；
- `deps.database` 等宿主能力改为通过所属包导出的 Token 从 `this.app.container` 解析；
- `services.notification = value` 等赋值改为在 `register()` 中注册插件自己的 `ServiceToken`；
- 异步初始化、启动和释放分别放入 `boot()`、`start()` 和 `shutdown()`；
- `server/routes/index.ts` 只接收 Application，通过只读 `app.container` 解析服务，并挂载到 `app.router`；
- 删除旧的 bootstrap context、`AppDeps`、`AppServices` 和 WeakMap 服务传递层，不为旧协议增加兼容 Token。

迁移后，配置仍由 Provider 从 `this.app.config` 读取；它不是一个额外的 `config` 构造参数对象。

## 生命周期

Application 按 Provider 添加顺序执行 `register`、`boot`、`start` 和 `ready`，关闭时按相反顺序执行 `shutdown`：

```text
Provider A: register ─ boot ─ start ─ ready ───────── shutdown
Provider B: register ─ boot ─ start ─ ready ─ shutdown
Provider C: register ─ boot ─ start ─ ready ─ shutdown
                                              C → B → A
```

| 阶段       | 适合执行的工作                                                     | 不应执行的工作                                        |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| `register` | 同步注册 Token、实例和惰性单例工厂                                 | 网络请求、数据库建表、启动 timer 等异步或有副作用工作 |
| `boot`     | 准备存储、运行内部初始化、校验跨 Provider 依赖                     | 对外宣称服务已经 ready                                |
| `start`    | 启动消费者、定时器、后台连接等可运行服务                           | 注册新服务                                            |
| `ready`    | 完成服务内部的就绪切换；此时所有 Provider 都已经完成 `start`       | 假设外部 HTTP Server 已经监听端口                     |
| `shutdown` | 停止任务、关闭连接、清理资源；实现应能安全处理服务从未被解析的情况 | 通过普通 `resolve()` 意外创建一个从未使用过的惰性服务 |

`ready` 表示 Application 内部服务已经可用，不表示 Node、Koa 或 Fastify Server 已监听端口。网络监听属于 Host Adapter。

释放惰性服务时优先使用 `resolveIfCreated()`：

```ts
public override shutdown(): Promise<void> {
  this.app.container.resolveIfCreated(workerToken)?.stop();
  return Promise.resolve();
}
```

这样关闭一个从未用过的服务不会先创建它再立即销毁。

如果 `boot`、`start` 或 `ready` 失败，Registry 会尝试逆序关闭已进入生命周期的 Provider；启动错误和清理错误都不会被静默吞掉。`shutdown()` 本身是幂等的，多次调用共享同一次关闭结果。

## 在 Application 中注册 Provider

Application 接收 Provider class，并在内部注入自身：

```ts
const app = new Application({ runtime });

app.addProvider(RouterProvider);
app.addProvider(DatabaseProvider);
app.addProvider(AuditLogProvider);
app.registerProviders();

await app.start();
```

一般不在组合根把普通应用配置逐项转发给 Provider。Provider 应从 `this.app.config` 读取自己拥有的配置：

```ts
app.addProvider(IdGeneratorProvider);
```

只有参数确实属于这个 Provider 实例，而不是 Application 配置时，才使用额外构造参数：

```ts
app.addProvider(CustomProvider, instanceSpecificArgument);
```

## 插件的 Service Provider

插件约定使用一个 `server/provider.ts` 作为服务端 Provider 入口。一个 Provider 可以注册多个 Token 和服务，通常不需要为了每个服务创建一个可加载 Provider 文件：

```text
packages/app-plugin-audit-log/
├── server/
│   ├── provider.ts       插件唯一的 Provider 入口
│   ├── service.ts        服务实现
│   ├── token.ts          稳定公开的服务标识
│   └── routes/index.ts   HTTP 边界，只解析服务
├── tests/
│   ├── provider.test.ts
│   └── routes.test.ts
└── package.json
```

### 1. 实现服务

服务只包含自己的行为和状态，不需要继承 Provider：

```ts
export type HeartbeatStatus = 'stopped' | 'running' | 'ready';

export interface HeartbeatState {
  readonly status: HeartbeatStatus;
  readonly startedAt: string | undefined;
}

export class HeartbeatService {
  private status: HeartbeatStatus = 'stopped';
  private startedAt: string | undefined;

  public start(): void {
    this.status = 'running';
    this.startedAt = new Date().toISOString();
  }

  public ready(): void {
    this.status = 'ready';
  }

  public stop(): void {
    this.status = 'stopped';
    this.startedAt = undefined;
  }

  public getState(): HeartbeatState {
    return {
      status: this.status,
      startedAt: this.startedAt,
    };
  }
}
```

### 2. 定义 Token

Token 由提供能力的插件拥有。其他插件需要复用该服务时，应从稳定 package export 导入 Token，而不是重新创建同名 Token。

```ts
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { HeartbeatService } from './service.js';

export const heartbeatServiceToken: ServiceToken<HeartbeatService> =
  createServiceToken<HeartbeatService>(
    '@nocobase/app-plugin-service-provider-example/heartbeat',
  );
```

### 3. 在 Provider 中注册并管理生命周期

下面是仓库内 `@nocobase/app-plugin-service-provider-example` 的核心 Provider：

```ts
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { HeartbeatService } from './service.js';
import { heartbeatServiceToken } from './token.js';

export interface ServiceProviderExampleApplication {
  readonly container: ServiceContainer;
}

export default class ServiceProviderExampleProvider extends ServiceProvider<ServiceProviderExampleApplication> {
  public readonly name: string =
    '@nocobase/app-plugin-service-provider-example';

  public override register(): void {
    this.app.container.singleton(
      heartbeatServiceToken,
      () => new HeartbeatService(),
    );
  }

  public override start(): Promise<void> {
    this.app.container.resolve(heartbeatServiceToken).start();
    return Promise.resolve();
  }

  public override ready(): Promise<void> {
    this.app.container.resolve(heartbeatServiceToken).ready();
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.app.container.resolveIfCreated(heartbeatServiceToken)?.stop();
    return Promise.resolve();
  }
}
```

未使用的生命周期方法可以省略，基类提供空实现。

### 4. 在 Route 中消费服务

Route 接收 `AppPluginRoutesApplication`。其中的 `container` 类型是只读的 `ServiceResolver`，允许查询和解析，不允许注册或替换服务：

```ts
import type { AppPluginRoutesApplication } from '@nocobase/app-server-kit/plugins';
import { Hono } from 'hono';

import { heartbeatServiceToken } from '../token.js';

export default function registerServiceProviderExampleRoutes({
  router,
  container,
}: AppPluginRoutesApplication): void {
  const routes = new Hono();

  routes.get('/status', (context) => {
    const heartbeat = container.resolve(heartbeatServiceToken);

    return context.json({
      service: '@nocobase/app-plugin-service-provider-example',
      ...heartbeat.getState(),
    });
  });

  router.route('/service-provider-example', routes);
}
```

不要在 Route 内 `new HeartbeatService()`。否则 Route 使用的是容器之外的第二个实例，也无法共享 Provider 生命周期。

### 5. 声明依赖并启用插件

插件至少需要：

```json
{
  "dependencies": {
    "@nocobase/app-server-kit": "workspace:^",
    "@nocobase/service-provider": "workspace:^",
    "hono": "catalog:"
  }
}
```

源码插件按约定发现 `server/provider.ts` 和 `server/routes/index.ts`；发布后的插件按相同结构发现 `dist/server/provider.js` 和 `dist/server/routes/index.js`。如果需要显式声明 Provider 入口，也可以在插件 `package.json` 中设置：

```json
{
  "nocobase": {
    "plugin": {
      "server": "./server/provider"
    }
  }
}
```

在目标 App 中注册并启用插件：

```bash
pnpm plugin:register service-provider-example --app app-template-default
```

Application 加载插件时，会把默认导出的 Provider class 传给 `app.addProvider(plugin.Provider)`。插件代码不需要自行创建 Application 或 Provider 实例。

## 测试 Provider

Provider 测试应直接验证 Token 注册和生命周期结果：

```ts
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import ServiceProviderExampleProvider from '../server/provider.js';
import { heartbeatServiceToken } from '../server/token.js';

it('registers and starts the heartbeat service', async () => {
  const container = new ServiceContainer();
  const provider = new ServiceProviderExampleProvider({ container });

  provider.register();
  await provider.start();
  await provider.ready();

  expect(container.resolve(heartbeatServiceToken).getState()).toMatchObject({
    status: 'ready',
  });

  await provider.shutdown();
});
```

Route 测试则向容器注入一个已知实例，再调用 Hono Router。这样可以分别验证 Provider 和 HTTP 边界，失败时更容易定位。

完成插件修改后运行：

```bash
pnpm --filter @nocobase/app-plugin-service-provider-example check
pnpm --filter @nocobase/app-template-default typecheck
pnpm --filter @nocobase/app-template-default test
pnpm --filter @nocobase/app-template-default build
```

## 设计约定

- 一个插件默认使用一个 `server/provider.ts` 入口；它可以注册多个相关服务。
- Provider `name` 使用插件包名或能力包名，并在 Application 内保持唯一。
- 服务注册集中在 `register()`；资源准备、运行和释放分别放到对应生命周期。
- 配置由 Provider 从 `this.app.config` 读取，不在 `app.ts` 重复拆分和转发。
- 跨包服务通过能力所有者导出的 Token 共享，不创建 `AppDeps` 一类聚合门面。
- Repository 负责数据访问，Service 负责业务或运行能力；两者都可以用 Token 注册，但命名应表达真实职责。
- Provider 可以持有完整 `ServiceContainer`；Route 只获得 `ServiceResolver`，不能改写容器。
- `register()` 保持同步。异步初始化放入 `boot()`，不要在构造函数中启动工作。
- `shutdown()` 使用逆序释放思维，并避免创建从未使用的惰性服务。
- Hono 是 Router service，不是 NocoBase Application；Provider 依赖 Application，而不是具体 HTTP Server 框架。

## 相关内容

- [插件开发快速开始](./plugin-development-quickstart.md)
- [App Platform Architecture](./app-platform-architecture.md)
- [可运行的 Service Provider 示例](../packages/app-plugin-service-provider-example/README.md)
