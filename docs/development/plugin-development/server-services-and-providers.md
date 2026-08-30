---
title: Server Services、Tokens 与 ServiceProviders
description: 为 NocoBase v3 插件设计 Service contract、稳定 ServiceToken、领域实现和 ServiceProvider 生命周期，并通过容器测试验证依赖关系。
---

# Server Services、Tokens 与 ServiceProviders

这四个角色组成一条依赖链：Service contract 描述能力，Token 提供稳定 identity，Service 实现领域行为，ServiceProvider 把实现注册进 App container。拥有 container 的 Route、Provider 或其他 Server 模块通过能力所有者导出的原始 Token 消费它；默认 Queue Job 不直接获得 container，详见 [Server Jobs](./server-jobs.md)。

```text
Service contract → Token → implementation → ServiceProvider → consumer
```

## 什么时候需要容器服务

多条 Route、多个 Provider 或 Job adapter 共享领域能力、需要替代实现、生命周期、测试注入或跨插件消费时，使用 Token 和 Provider。纯函数、单模块私有 helper、数据转换或不需要替换和生命周期的内部类不必进入容器。也不要把 Application 的每个配置值机械注册成 Token；Provider 通常直接从 `this.app.config` 读取自己拥有的配置。

## 先定义 contract 和 Token

能力所有者在公开 Server surface 中定义类型和 Token：

```ts
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface AuditLogService {
  list(): Promise<readonly AuditRecord[]>;
  dispose(): void;
}

export const auditLogServiceToken: ServiceToken<AuditLogService> =
  createServiceToken<AuditLogService>('@nocobase/app-plugin-audit-log/service');
```

消费方必须 import 这个 Token 对象。即使名称字符串相同，重新调用 `createServiceToken()` 得到的也是不同 identity，无法解析原来的 binding。跨插件消费使用 `package.json#exports` 暴露的稳定入口，不从插件深层源码路径 import。

`ServiceToken<T>` 标识的是能力角色，不要求 `T` 必须是 class。Interface 的普通对象、函数、普通值都可以注册；同一种类型也可以用不同 Token 区分不同业务角色，例如 public/private storage。先根据调用者需要设计 contract 和角色，再决定默认实现形态。

## 实现领域 Service

Service 实现 contract，并保持与运输和调度层无关：

- 不读取 Hono Context；
- 不决定 HTTP status；
- 不定义 Route path；
- 不决定 Queue retry；
- 可以被 Route、Provider、其他 Service 或 Job adapter 复用。

只有 contract 和跨插件需要使用的类型属于公共 API；默认实现可以保持插件内部。

## 选择注册方式和解析依赖

Container 提供两种注册方式：

| 场景                           | API                                   |
| ------------------------------ | ------------------------------------- |
| 已经创建好的对象、函数或普通值 | `container.instance(token, value)`    |
| 第一次使用时才创建的服务       | `container.singleton(token, factory)` |

惰性工厂通过传入的 `resolver` 解析其他服务，不读取模块级可变变量：

```ts
this.app.container.singleton(
  auditLogServiceToken,
  (resolver) =>
    new DefaultAuditLogService(
      resolver.resolve(databaseManagerToken),
      resolver.resolve(loggingToken),
    ),
);
```

`resolve()` 对未注册服务、重复注册和循环依赖给出明确错误；`has()` 只判断 binding 是否存在；`resolveIfCreated()` 只返回已经创建的 singleton，不触发实例化。

## 用 ServiceProvider 注册生命周期

```ts
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

interface AuditLogProviderApplication {
  readonly config: {
    readonly auditLog: { readonly retentionDays: number };
  };
  readonly container: ServiceContainer;
}

export class AuditLogProvider extends ServiceProvider<AuditLogProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-audit-log';

  public override register(): void {
    this.app.container.singleton(
      auditLogServiceToken,
      () => new DefaultAuditLogService(this.app.config.auditLog.retentionDays),
    );
  }

  public override shutdown(): Promise<void> {
    this.app.container.resolveIfCreated(auditLogServiceToken)?.dispose();
    return Promise.resolve();
  }
}
```

Provider 只声明自己真正需要的最小 Application 结构；只依赖 container 时不要扩大为整个 `AppPluginApplication`。Provider 使用 `this.app.container`，不创造 `services` 全局对象，也不把 App 配置逐项变成额外 constructor 参数。

生命周期依次是 `register → boot → start → ready → shutdown`。所有 Provider 先完成同一阶段，再进入下一阶段；shutdown 按反向顺序执行。`singleton()` 在第一次 `resolve()` 时才创建实例。清理时用 `resolveIfCreated()`，避免为了关闭而创建从未使用的服务。

各阶段的职责：

| 阶段       | 适合的工作                                | 不应执行的工作                        |
| ---------- | ----------------------------------------- | ------------------------------------- |
| `register` | 同步注册 Token binding                    | 网络请求、建表、timer 等异步副作用    |
| `boot`     | 异步准备并校验跨 Provider 依赖            | 对外宣称服务已 ready                  |
| `start`    | 启动 worker、listener 或后台资源          | 注册新的 Service binding              |
| `ready`    | 所有 Provider 已 start 后切换内部就绪状态 | 假设 HTTP Host 已开始监听             |
| `shutdown` | 停止并释放已创建资源                      | 用 `resolve()` 创建从未使用的惰性服务 |

`ready` 只表示 Application 内部服务可用，不表示 Node/Koa/Fastify Host 已监听端口。Provider 名称必须稳定且唯一。不要在构造器或声明模块顶层启动服务；`server:inspect` 会导入声明，但不会实例化 Provider。

`boot`、`start` 或 `ready` 失败时，Registry 会尝试逆序 shutdown 已进入生命周期的 Providers；启动错误和清理错误都不会被吞掉。Provider 的 shutdown 应可安全重复，并处理 Service 从未解析的情况。

## 在消费者中解析

```ts
const auditLog = container.resolve(auditLogServiceToken);
```

Route 负责 HTTP 和安全边界，Provider 或明确的 Job adapter 负责把 container 能力接入异步执行，Service 负责领域逻辑。可选能力可以先用 `container.has(token)` 判断；必需能力应让缺失 binding 明确失败，不要静默创建另一份 Token 或 fallback 实现。

## 测试容器契约

使用独立 `ServiceContainer` 和最小 App fixture：

- `register()` 后 Token 已存在但 singleton 尚未创建；
- 第一次 `resolve()` 创建实例，多次解析返回同一实例；
- 测试可以用 `container.instance(token, fake)` 注入替代实现；
- 生命周期阶段按顺序调用，启动失败会触发 shutdown；
- shutdown 不创建未使用服务并释放已创建资源；
- 重复 Token、Provider 名称和循环依赖明确失败；
- 公共 Server export 能被真实消费方解析。

`server:inspect` 只确认 Provider 的最终装配顺序和来源，不能证明 binding、生命周期或 Service 行为。通用容器与生命周期细节见 [Service Provider](../../service-provider.md)，不同 Token value/role 的小型示例见 [ServiceToken Examples](../../service-token-examples.md)；本页只规定这些能力在插件中的选择和组合方式。

返回[Server 模块选择](./server.md)，或继续开发 [Server Routes](./server-routes-examples.md) 和 [Jobs](./server-jobs.md)。
