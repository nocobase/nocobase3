---
title: Server 模块选择
description: 面向 AI Agent 的 NocoBase v3 Server 插件模块导航，帮助在 Services、Tokens、ServiceProviders、Routes、Jobs、Migrations 和 Seeds 之间选择正确所有权。
---

# Server 模块选择

Server 插件把可复用领域逻辑放入 Service，用 Token 表达稳定能力 identity，用 ServiceProvider 注册实现和生命周期，用 Route 处理 HTTP，用 Job 编排异步执行，用 Migration/Seed 管理数据库历史和初始数据。

## 按需求选模块

| 需求                           | 使用                    | 继续阅读                                                                   |
| ------------------------------ | ----------------------- | -------------------------------------------------------------------------- |
| 可复用领域逻辑                 | Service                 | [Services、Tokens 与 ServiceProviders](./server-services-and-providers.md) |
| 跨模块/插件的稳定能力 identity | ServiceToken            | [Services、Tokens 与 ServiceProviders](./server-services-and-providers.md) |
| 注册实现和管理生命周期         | ServiceProvider         | [Services、Tokens 与 ServiceProviders](./server-services-and-providers.md) |
| App 内 `/api` 接口             | `defineApiRoutes()`     | [Server Routes](./server-routes-examples.md)                               |
| callback、webhook 或顶层入口   | `defineRootRoutes()`    | [Server Routes](./server-routes-examples.md)                               |
| 异步、延迟、批量或可重试工作   | Queue Job               | [Server Jobs](./server-jobs.md)                                            |
| 表、字段、索引、约束、metadata | Migration               | [Database Migrations](./database-migrations.md)                            |
| 插件必需的初始记录             | Seed                    | [Database Seeds](./database-seeds.md)                                      |
| API error、响应或外发消息翻译  | Server locale resources | [插件国际化](./i18n.md)                                                    |

```text
Route   → HTTP input/output and security policy
Job     → asynchronous orchestration and retry boundary
Service → reusable domain behavior
Provider → registration and lifecycle
Token   → stable capability identity
```

## 声明 Server 插件

Server contributions 在 `server/plugin.ts` 直接组合：

```ts
import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import providers from './providers/index.js';
import routes from './routes/index.js';

const plugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-audit-log',
  locales: () => import('./locales/index.js'),
  providers,
  routes,
  queue: { jobs: ['./server/jobs'] },
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
});

export default plugin;
```

只声明真实能力。Routes 和 Provider constructors 是直接 contributions；Jobs、Migrations 和 Seeds 使用 package-relative locations。目标 App 通过 `server/plugins.ts` 显式注册 `exports["./server/plugin"]`。

## 所有权边界

- Service 不读取 Hono Context、不返回 HTTP status，也不决定 Queue retry；
- Route 处理 HTTP、输入输出和自己的安全策略，然后调用 Service；
- Job 校验可序列化 payload、处理重试/幂等边界，并调用可复用领域操作；默认 Job factory 不注入 ServiceContainer；
- Provider 注册依赖和管理资源生命周期，不承载 Route handler；
- Token 由能力所有者创建和公开，消费者不得重建同名 Token；
- Migration 是不可变 schema 历史，Seed 不创建结构。

每个 Server Route 都拥有显式安全策略。登录接口自己安装 authentication/authorization；公开 webhook/callback 记录原因并验证签名、state、时间戳、重放或幂等要求。任何 Route 都不能依赖另一个 contribution 或当前 composition order 获得保护。

## 声明模块保持轻量

`server:inspect` 和 App composition 会 import `server/plugin.ts` 及其 declaration modules。顶层只创建 definitions，不连接数据库、不启动 worker、不执行 Route factory，也不实例化 Provider。真正启动和清理由 Provider lifecycle、Route request 或 Queue runtime 管理。

## 测试和最终装配确认

分别测试 Container/Provider、Route、Job、Migration/Seed 的真实行为。注册变化后运行：

```bash
pnpm plugin:inspect <name> --app <app> --json
pnpm --filter <target-app> server:inspect --json
```

Inspector 只确认最终 Server composition、Route scopes 和配置 locations；它不执行 Provider、Route factory、Job、Migration 或 Seed。继续运行插件和目标 App 的 lint、typecheck、test、build 以及必要的 runtime/full-stack 验证。

## Agent 自检

- 领域、HTTP、异步调度和生命周期职责分离；
- 所有消费者 import 能力所有者的原始 Token；
- Route 安全不依赖 composition order；
- Jobs 使用稳定 identity 和可序列化 payload；
- Migration/Seed 路径、历史和测试正确；
- declarations、exports、App registration 和行为测试一致；
- App-facing 服务、接口、Job 或数据前置条件变化已更新 Plugin Skill。
