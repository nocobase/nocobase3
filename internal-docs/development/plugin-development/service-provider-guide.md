---
title: ServiceProvider 使用指南
description: 面向 NocoBase v3 插件开发与 AI Agent，以完整示例说明 Service、Token、Provider、插件注册、生命周期、资源所有权和验证步骤。
---

# ServiceProvider 使用指南

ServiceProvider 负责把插件能力接入应用，并管理这些能力的生命周期；Service 负责具体业务逻辑。本页针对 **v3 Server 插件**，从一个可验证的最小实现开始。Client 初始化请读 [Client ServiceProviders](./client-service-providers.md)，React Context 请读 [React Providers](./client-react-providers.md)。

## Agent 从哪里开始

按当前问题选读，不必加载全部关联文档：

| 当前问题 | 阅读位置 | 应得到的结果 |
| --- | --- | --- |
| 是否需要 Provider | 下一节“先判断所有权和职责” | 确定能力所属模块，不额外创建全局初始化机制 |
| 如何实现第一个 Provider | “最小实现”与“接入目标 App” | Service、Token、Provider、声明和注册形成完整链路 |
| 何时读取配置、依赖其他服务 | “生命周期与依赖顺序”和“配置与数据库” | 明确依赖的注册、准备与启动阶段 |
| 如何停止资源、处理启动失败 | “资源所有权与失败清理” | 未启动、部分启动、正常关闭均可清理 |
| 如何验证或定位错误 | “验证与排错” | 行为测试与目标 App 验证结果 |

需要生命周期执行细节时读 [ServiceProvider 生命周期与装配](./service-provider.md)；需要不同 Token 值或工厂模式时读 [ServiceToken 与 ServiceContainer 示例](./service-token-examples.md)。

## 先判断所有权和职责

先确认能力是否需要独立发布、供多个 App 使用。可复用插件放在 `packages/plugins/app-plugin-*`；仅属于一个 App 的业务代码直接放入该 App，不因使用 Provider 就额外创建插件。

| 需求 | 放在哪里 | 边界 |
| --- | --- | --- |
| 计算、校验、数据转换、一次业务操作 | 普通函数或 Service | 需要数据库不等于需要继承 ServiceProvider |
| 共享服务、替代实现、跨插件消费 | Service contract + Token | Token 由能力所有者创建，消费者导入原对象 |
| 注册实现、组装依赖、启动和停止资源 | ServiceProvider | 使用当前 App 的 container，不维护全局实例 |
| HTTP 路径、请求校验、认证与授权 | Route contribution | Provider 不直接注册 Route；每条 Route 自己拥有安全边界 |
| 异步任务、重试、调度与并发控制 | Queue Job | 默认 Job factory 不直接获得 container，见 [Jobs](./server-jobs.md) |
| 表、字段、索引和必要初始数据 | Migration / Seed | Provider 不代替数据库迁移和种子任务 |

Container 决定依赖从哪里来；生命周期决定何时注册、准备、启动和释放它。两者不能互相替代：解析成功只说明服务已构造，不代表它已经完成异步初始化。

## 最小实现：由 Provider 管理定时计数服务

以下文件共同组成一个 Server-only 插件示例 `@nocobase/app-plugin-tick-counter`。计数器仅用于展示资源生命周期，**不提供持久化、分布式调度或跨进程单例保证**。生产任务需要这些能力时，优先使用 Queue。

从仓库根目录创建插件基础结构，沿用生成器提供的共享配置和发布元数据：

```bash
pnpm plugin:create tick-counter --with server.service-providers --no-install
```

这是实现新插件时的命令，不要为了阅读或检查文档执行它。已有插件只修改其拥有的文件。下面的路径均相对于插件根目录；替换生成的示例 Provider，不要把旧示例一起注册。

```text
server/
  tokens.ts
  services/tick-counter.ts
  providers/tick-counter.ts
  providers/index.ts
  plugin.ts
  index.ts
tests/
  provider.test.ts
```

### 1. 定义 Service contract 和原始 Token

`server/tokens.ts`：

```ts
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface TickCounterService {
  start(): void;
  stop(): void;
  getCount(): number;
}

export const tickCounterToken: ServiceToken<TickCounterService> =
  createServiceToken<TickCounterService>(
    '@nocobase/app-plugin-tick-counter/service',
  );
```

Token 按对象 identity 查找，而不是按名称字符串查找。其他插件必须从本插件公开入口导入 `tickCounterToken`，不能重新调用 `createServiceToken()` 创建同名 Token。

### 2. Service 实现行为并管理自己的资源

`server/services/tick-counter.ts`：

```ts
import type { TickCounterService } from '../tokens.js';

export class DefaultTickCounter implements TickCounterService {
  private timer: ReturnType<typeof setInterval> | undefined;
  private count: number = 0;

  public start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => {
      this.count += 1;
    }, 1_000);
  }

  public stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  public getCount(): number {
    return this.count;
  }
}
```

构造器不启动 timer；重复 `start()` 不创建第二个 timer；尚未启动或已经停止时，`stop()` 可以安全调用。Provider 负责在应用生命周期中调用这些方法，不负责计数逻辑。

### 3. Provider 注册并驱动 Service

`server/providers/tick-counter.ts`：

```ts
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { DefaultTickCounter } from '../services/tick-counter.js';
import { tickCounterToken } from '../tokens.js';

type TickCounterApplication = Pick<AppPluginApplication, 'container'>;

export class TickCounterProvider extends ServiceProvider<TickCounterApplication> {
  public readonly name: string = '@nocobase/app-plugin-tick-counter';

  public override register(): void {
    this.app.container.singleton(
      tickCounterToken,
      () => new DefaultTickCounter(),
    );
  }

  public override start(): Promise<void> {
    this.app.container.resolve(tickCounterToken).start();
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.app.container.resolveIfCreated(tickCounterToken)?.stop();
    return Promise.resolve();
  }
}
```

`ServiceProvider` 从 `@nocobase/service-provider` 导入。Provider 必须有稳定、在 App 内唯一的 `name`；一个插件有多个 Provider 时使用包名加能力后缀。

这里用 `Pick<AppPluginApplication, 'container'>` 明确实际依赖，完整 App 可以满足它，测试也无需伪造 router、配置和路径。需要更多 App 字段时扩展这个类型，或使用完整 `AppPluginApplication`。

`singleton()` 注册同步工厂，第一次 `resolve()` 才创建实例。不要给需要同步消费的 Token 传入异步工厂；异步准备放在适当生命周期里。释放时使用 `resolveIfCreated()`，避免在关闭阶段创建从未使用过的服务。

### 4. 聚合 Provider 并声明 Server 插件

`server/providers/index.ts`：

```ts
import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { TickCounterProvider } from './tick-counter.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  TickCounterProvider,
];

export default serviceProviders;
```

`server/plugin.ts`：

```ts
import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';

const plugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-tick-counter',
  serviceProviders,
});

export default plugin;
```

`server/index.ts`：

```ts
export { default } from './plugin.js';
export { tickCounterToken } from './tokens.js';
export type { TickCounterService } from './tokens.js';
```

聚合模块默认导出名为 `serviceProviders` 的构造器数组，插件声明默认导入并用同名属性组合。这里只声明构造器，不创建 Provider，不自行驱动生命周期。

公开 Service contract 和 Token，使消费者可以从 `@nocobase/app-plugin-tick-counter/server` 导入；默认 Service 实现和 Provider 保持内部。`server/plugin.ts` 及其导入链保持无启动副作用：App composition 和 Inspector 都可能导入它们。

## 接入目标 App

使用注册命令预览并应用目标 App 的修改；示例目标是 Default，实际任务中应显式选择需要使用此能力的 App：

```bash
pnpm plugin:register tick-counter --app app-template-default --dry-run --json
pnpm plugin:register tick-counter --app app-template-default
```

JSON 结果先检查 `ok`、`status` 与进程退出码，再读取问题和建议。生成器命令使用 `--no-install` 后，由注册流程统一安装依赖。完整流程见 [Source workspace 插件注册](./plugin-registration-workspace.md)。

注册后应检查这些事实：

- `package.json` 的源码 `./server` export 指向 `server/index.ts`，发布 export 指向对应 `dist/server/index.js` 和声明文件，且 `files` 包含构建输出。
- `@nocobase/service-provider`、`@nocobase/app-server` 使用生成器提供的 peerDependency + devDependency 形态。Token 和 container 不能因安装出第二份模块而失去 identity。
- 目标 App 的 `server/plugins.ts` 显式包含该插件 definition。只安装包不会执行 Provider，不能通过 `nocobase.plugins` 元数据代替注册。
- 保留目标 App 原有注册项；仅在有实际阶段依赖时调整顺序。普通服务消费者导入公开 Token 并调用 `app.container.resolve(tickCounterToken)`，不创建另一份 Service。

新建 App-facing 能力还应更新插件拥有的 `skills/`，说明公开入口、依赖条件和验证方式；不要编辑 App 中生成的 `.agents/skills/`。详见 [Plugin Skills](./skills.md)。

## 生命周期与依赖顺序

当前 Server 应用按以下顺序启动：

```text
所有 Provider register
→ 注册 locale 资源
→ 所有 Provider boot
→ 创建并挂载 Route contributions
→ 所有 Provider start
→ 所有 Provider ready
```

同一阶段按组合顺序执行，关闭按相反顺序执行。这不是“一个 Provider 执行完全部阶段，再启动下一个”。

| 阶段 | 方法签名 | 应做什么 | 不能假设什么 |
| --- | --- | --- | --- |
| `register` | `register(): void` | 同步注册 instance 或 singleton 工厂 | 不执行异步 I/O，也不假设后续 Provider 已注册 |
| `boot` | `boot(): Promise<void>` | 异步准备、校验依赖、组装能力 | 所有 Token 已注册不等于所有依赖已完成 boot |
| `start` | `start(): Promise<void>` | 启动 worker、consumer、listener、timer | 后续 Provider 未必已 start |
| `ready` | `ready(): Promise<void>` | 所有 Provider 已 start 后的内部就绪操作 | 外部 HTTP Host 未必已监听 |
| `shutdown` | `shutdown(): Promise<void>` | 释放已经创建且归自己所有的资源 | 启动可能未完成，singleton 可能从未创建 |

未使用的方法可以省略，基类有空实现。Route factory 在 `boot` 后、`start` 前执行，不能在 factory 中依赖尚未启动的后台服务。

如果 B 的 `boot()` 必须使用 A 在 `boot()` 中准备的数据，应明确 A 在 B 前。若 B 需要 A 的 `start()` 完成，就不能只调整 B 的 `boot()` 顺序；应选择满足前置条件的阶段或重构双方契约。不要通过延时、轮询全局变量或额外 `init()` 回调掩盖未声明的依赖。

## 配置与数据库：按能力契约组装

需要配置时，使用 `defineAppConfig()` 定义类型、schema 和默认值，将配置 definition 放入 `defineServerPlugin({ config })`，然后通过 `this.app.config.get(configDefinition)` 读取。不是 `config.get('namespace.path')`。

以下片段展示配置 API，独立于前面的最小计数器实现：

```ts
import {
  defineAppConfig,
  type AppConfigDefinition,
} from '@nocobase/app-server/config';
import { Type } from '@sinclair/typebox';

export interface CounterConfig {
  readonly intervalMs: number;
}

export const counterConfig: AppConfigDefinition<CounterConfig> =
  defineAppConfig({
    namespace: 'tickCounter',
    schema: Type.Object({
      intervalMs: Type.Integer({ minimum: 1 }),
    }),
    defaults: { intervalMs: 1_000 },
  });
```

将它接入示例需要一起修改三处：插件声明增加 `config: counterConfig`；Provider 的 App 类型增加 `config` 字段，并在工厂中调用 `this.app.config.get(counterConfig)`；Service 构造器接收 `intervalMs` 并用于 timer。`@sinclair/typebox` 是运行时值导入，需声明为服务端依赖。读取一次配置不会自动让已创建的 timer 热更新；如需热更新，必须设计并测试重配置及订阅清理行为。

数据库能力通过 `@nocobase/db` 导出的 `databaseManagerToken` 获取，当前查询接口使用 `database.query()` 或 `database.query(connectionName)`。不要复制旧示例中的 `db.repository()`。只有 Token 注册完成，并且所选数据库、schema 和必要数据已准备好，才可以执行查询；不能把 `boot()` 当成数据库就绪的通用保证。

数据库初始化和应用安装模式会影响这些条件。沿 [Database 模块选择](./database.md) 确定需要的是运行时查询、Migration 还是 Seed；建表不放入 Provider，数据库历史也不从运行时模型动态推导。

扩展 Auth、通知等其他插件时，先读能力所有者的 Skill 和公开契约，确认真实 Token、配置入口及允许扩展的阶段。本指南不假设存在通用 `authManager.plugin()`。Provider 提供组装时机，不会凭空提供另一个插件尚未公开的扩展 API。

## 资源所有权与失败清理

“谁创建资源，谁负责释放”具体指资源的生命周期所有者，而不是谁调用了 `resolve()`。

- 本插件的 Service 创建 timer，Provider 在 `shutdown()` 中调用该 Service 的停止方法。
- 从其他插件解析的共享数据库、日志或队列服务，由其拥有者清理；当前 Provider 不关闭它们。
- 插件自己创建的连接、consumer、订阅或监听器，应有明确释放路径；订阅返回的取消函数也要保存并调用。
- 异步清理必须等待完成，不要启动一个 Promise 后直接返回成功。

`boot`、`start` 或 `ready` 失败时，Registry 会尝试逆序清理已进入生命周期的 Providers，并保留启动与清理错误。清理可能发生在资源只创建一部分时；因此，应在后续可能失败的操作之前保存已创建资源的引用，并让停止方法容忍未启动和重复停止。

Registry 的 `shutdown()` 幂等并不意味着任意外部资源会自动幂等。不要吞掉初始化错误让 App 假装启动成功，也不要在关闭阶段用 `resolve()` 创建新的惰性实例。失败语义和边界见 [生命周期深入参考](./service-provider.md)。

## 验证与排错

### 最小行为测试

以下 `tests/provider.test.ts` 测试前面的计数器实现。测试使用独立容器和 fake timers，不启动真实后台任务，也不构造完整 Application：

```ts
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TickCounterProvider } from '../server/providers/tick-counter.js';
import { tickCounterToken } from '../server/tokens.js';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('tick counter provider', () => {
  it('starts one timer and stops it on shutdown', async () => {
    vi.useFakeTimers();
    const container = new ServiceContainer();
    const provider = new TickCounterProvider({ container });
    provider.register();

    expect(container.has(tickCounterToken)).toBe(true);
    expect(container.resolveIfCreated(tickCounterToken)).toBeUndefined();
    await provider.start();
    const service = container.resolve(tickCounterToken);
    expect(container.resolve(tickCounterToken)).toBe(service);

    service.start();
    vi.advanceTimersByTime(2_000);
    expect(service.getCount()).toBe(2);
    await provider.shutdown();
    await provider.shutdown();
    vi.advanceTimersByTime(2_000);
    expect(service.getCount()).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not create an unused service during shutdown', async () => {
    const container = new ServiceContainer();
    const provider = new TickCounterProvider({ container });
    provider.register();
    await provider.shutdown();
    expect(container.resolveIfCreated(tickCounterToken)).toBeUndefined();
  });
});
```

真实插件还应根据行为补充依赖准备失败、部分启动后释放、配置边界和正常业务调用测试。测试文件放在插件根目录 `tests/`，不放在源码旁；测试本插件提供的行为，不重复证明 Registry 自身所有内部规则。

### 完成条件

用实际包名运行插件及受影响目标 App 的 `lint`、`typecheck`、`test`、`build`。此示例的插件命令是：

```bash
pnpm --filter @nocobase/app-plugin-tick-counter lint
pnpm --filter @nocobase/app-plugin-tick-counter typecheck
pnpm --filter @nocobase/app-plugin-tick-counter test
pnpm --filter @nocobase/app-plugin-tick-counter build
```

还需在目标 App 验证注册后能够启动、消费者能解析公开 Token、关闭后资源停止。若加入 Route，验证该 Route 的认证与授权行为；若加入数据库结构，验证迁移。Provider 单元测试不覆盖这些集成边界。

只有在注册缺失或顺序不清楚时才运行 Inspector。`server:inspect` 可以显示 owner、构造器与组合顺序，但不实例化 Provider、不验证 Token binding 和清理行为，不能代替测试。

| 症状 | 优先检查 |
| --- | --- |
| `Service "..." is not registered` | Provider 是否注册、消费者是否使用原始 Token、是否安装了重复模块 |
| `Service "..." is already registered` | 同一 Token 是否被重复绑定、是否错误地试图覆盖现有 binding |
| 服务能解析，但还不可用 | 异步准备在哪个阶段完成、依赖顺序是否满足、是否过早消费 |
| 启动挂起 | `start()` 是否等待了不会结束的 worker 主循环，而非等待启动完成 |
| 关闭后进程不退出 | timer、连接、订阅或 worker 是否由拥有者清理，异步关闭是否被等待 |
| 只读检查触发外部连接 | 声明模块或其导入链是否在顶层执行了初始化副作用 |

向用户报告时说明改动归属、注册的目标 App、执行过的验证及未覆盖条件。不要把“Inspector 能看到 Provider”报告成“服务已验证可用”。

## 规则的源码依据

出现文档与实现不一致时，只查看对应源码，不顺序阅读整个框架：

- [Provider 基类与签名](../../../packages/libs/service-provider/src/provider.ts)
- [Token 与 Container](../../../packages/libs/service-provider/src/container.ts)
- [生命周期 Registry](../../../packages/libs/service-provider/src/registry.ts)
- [Server Application 启动顺序](../../../packages/app/app-server/src/application/index.ts)
- [插件类型与 contributions](../../../packages/app/app-server/src/plugins/types.ts)
- [仓库已有 Provider 示例](../../../packages/examples/app-plugin-service-provider-example/server/providers/service-provider-example.ts)

返回[插件开发目录](./README.md)，或按任务继续阅读 [Services、Tokens 与 ServiceProviders](./server-services-and-providers.md)、[公共契约](./public-contracts.md)、[测试与验证](./testing.md)。
