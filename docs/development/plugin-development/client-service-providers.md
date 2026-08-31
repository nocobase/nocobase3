---
title: Client ServiceProviders
description: 在 NocoBase v3 ClientApplication 中使用共享 ServiceProvider 生命周期注册 Browser Service、配置 Refine，并管理启动与清理。
---

# Client ServiceProviders

Client 与 Server 共享 `@nocobase/service-provider` 的 Container、Token 和生命周期原语。Client ServiceProvider 由 `ClientApplication` 实例化，在 `app.start()` 中执行；它取代旧的 Client Bootstrap，并与只负责 React 树组合的 `reactWrappers` 明确分工。

## 适用场景

- 在 `register()` 中向 `app.container` 注册 Browser Service；
- 在 `boot()` 中配置 Refine providers、resources 或 handlers；
- 在 `start()` 中启动 listener、connection 或 timer；
- 在 `shutdown()` 中释放 Provider 拥有的资源。

页面用 Route，共享 React Context 用 React Wrapper，页面局部数据加载放在 component lifecycle。

## 最小 Client ServiceProvider

```ts
import { ClientApplication } from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';

export class AuditLogServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-audit-log/client';

  public override register(): void {
    this.app.container.singleton(auditLogToken, () => createAuditLogService());
  }

  public override boot(): Promise<void> {
    this.app.refine.addResources([{ name: 'audit-log', list: '/audit-log' }]);
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.app.container.resolveIfCreated(auditLogToken)?.close();
    return Promise.resolve();
  }
}
```

`app.refine` 只在当前 Provider lifecycle method 内可用，以便记录 contribution owner。启动完成后读取最终结果使用 `app.refineConfig`。

## 静态声明

```ts
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';

import { AuditLogServiceProvider } from './audit-log.js';

export const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  AuditLogServiceProvider,
];
```

```ts
import serviceProviders from './providers/index.js';

export default defineClientPlugin({
  packageName: '@nocobase/app-plugin-audit-log',
  serviceProviders,
});
```

Contribution 是静态 constructor 数组或同步 options factory，不使用 contribution-level dynamic import。静态 import 不会执行 lifecycle；真正启动发生在 `app.start()`。

## 生命周期顺序

```text
instantiate
→ register all
→ boot all
→ finalize Refine config
→ build and validate render config
→ start all
→ ready all
```

`app.shutdown()` 先 unmount React root，再逆序执行 Provider `shutdown()`。启动失败也会尝试逆序清理已经进入生命周期的 Provider。

## 测试

- Runtime resolution 后 Provider 尚未执行；
- `register()` 注册正确 Token，惰性 singleton 只创建一次；
- `boot()` 对 Refine 的配置出现在 `app.refineConfig`；
- lifecycle 顺序和逆序 shutdown 正确；
- 异步失败阻止启动并触发清理；
- import declaration 不产生启动副作用。

`client:inspect --type service-providers` 只报告 owner、constructor 和 order，不实例化 Provider，也不验证 lifecycle。

返回[Client 模块选择](./client.md)，或阅读[通用 ServiceProvider 生命周期](./service-provider.md)。
