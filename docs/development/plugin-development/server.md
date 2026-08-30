---
title: Server 插件开发
description: 在 NocoBase 插件中使用 Service、ServiceToken、ServiceProvider、API Routes、Root Routes 和 Queue Jobs 实现服务端能力，并将 contributions 组合到 server/plugin.ts。
---

# Server 插件开发

Route 入口（`defineRootRoutes()`、`defineApiRoutes()`）统一见[Route 插件开发](./routes.md)。本页重点说明 Service、Provider、Job 和 Server composition。

本页面向实现服务端能力的 Agent。先阅读 [插件结构](./plugin-structure.md) 和 [插件声明](./plugin-declaration.md)，再按需求选择 Service、Route、Provider、Job 或 Database。

## 先选择哪种能力

| 需求                     | 实现                 | 入口                   |
| ------------------------ | -------------------- | ---------------------- |
| 可复用业务逻辑           | Service              | `server/services/`     |
| 跨模块稳定契约           | ServiceToken         | `server/tokens.ts`     |
| 注册服务、生命周期       | ServiceProvider      | `server/providers/`    |
| App 内 `/api` 接口       | `defineApiRoutes()`  | `server/routes/`       |
| 不挂载 `/api` 的顶层入口 | `defineRootRoutes()` | `server/routes/`       |
| 异步后台处理             | Queue Job            | `server/jobs/`         |
| schema 历史              | Migration            | `database/migrations/` |
| 必要初始数据             | Seed                 | `database/seeds/`      |

## 检查顺序

```text
package.json → server/plugin.ts → providers/index.ts → tokens.ts
→ routes/index.ts → jobs/ → database/ → tests/ → target App/server/plugins.ts
```

## Service、Token 和 Provider

Service 只包含领域行为；需要被其他模块依赖时，在 `tokens.ts` 导出接口和 `ServiceToken`，由 Provider 在 `register()` 中注册惰性单例。Provider 负责生命周期，不把 HTTP 逻辑塞进服务。

```ts
export const auditLogToken = createServiceToken<AuditLogService>(
  '@nocobase/app-plugin-audit-log/audit-log',
);

export class AuditLogProvider extends ServiceProvider<AuditLogProviderApplication> {
  public override register(): void {
    this.app.container.singleton(
      auditLogToken,
      () => new DefaultAuditLogService(),
    );
  }
}
```

遵循 `register → boot → start → ready → shutdown` 生命周期；关闭时用 `resolveIfCreated()`，避免为了清理而创建未使用的服务。完整生命周期说明见 [Service Provider](../../service-provider.md)。

## API 和 Root Routes

每个 Route contribution 必须拥有并测试自己的 authentication 和
authorization 边界。不要依赖另一个插件较早注册的 middleware，也不要依赖当前
Server composition 顺序偶然提供身份或权限保护；插件顺序变化后，Route
的安全语义必须保持不变。

认证 middleware 还必须只覆盖本 Route 实际拥有的路径。插件 router 上过宽的
`router.use('*', ...)` 可能在 Hono 挂载后影响更晚注册的 contribution；使用本插件的
明确路径或子 router，并测试后续插件路径不受影响。

需要登录时，在本插件的 Route factory 中显式解析 Authentication Token
并注册认证 middleware；需要业务权限时，再显式解析 Authorization Token
并检查稳定的 resource/action。测试至少覆盖未登录、无权限和允许访问的结果。

Route factory 直接作为 contribution 返回 Hono router，并从 `container` 解析公开 Token：

```ts
export const apiRoutes = defineApiRoutes(({ container }) => {
  const router = new Hono();
  router.get('/audit-log', (c) =>
    c.json(container.resolve(auditLogToken).list()),
  );
  return router;
});
```

`defineApiRoutes()` 的路径挂在 App 的 `/api` 下；`defineRootRoutes()` 用于不应带 `/api` 的顶层入口。路径写 package 自己的相对子路径，不重复宿主的 `/api`、public base path 或 app name；测试时同时覆盖配置了 base path 的 App。

Routes 是直接 contributions，不使用 `routes: () => import(...)` loader。统一在 `server/routes/index.ts` 导出数组，再由 `server/plugin.ts` 组合。

## Queue Jobs

Job 放在 `server/jobs/`，在 `server/plugin.ts` 以 package-relative 路径声明：

```ts
queue: {
  jobs: ['./server/jobs'];
}
```

Job 通过 `this.context` 访问 queue 执行信息，并通过构造依赖使用 App 服务；把可重试业务封装在 Service，Job 只编排触发、重试和结果记录。没有 Job 时不要保留无效目录声明。

## 组合 Server 插件

```ts
export default defineServerPlugin({
  packageName: '@nocobase/app-plugin-audit-log',
  providers,
  routes,
  database: { migrations: './database/migrations', seeds: './database/seeds' },
  queue: { jobs: ['./server/jobs'] },
});
```

App 必须在 `server/plugins.ts` 显式注册 definition；不要依赖 `nocobase.plugins` 自动发现。

## 测试和验证

在插件根目录 `tests/` 测试 Provider 注册和生命周期、Route 状态码/响应/权限、Plugin declaration、Job 行为及真实 Migration。运行：

```bash
pnpm --filter <plugin-package> lint
pnpm --filter <plugin-package> typecheck
pnpm --filter <plugin-package> test
pnpm --filter <plugin-package> build
pnpm --filter <target-app> server:inspect --json
```

`server:inspect` 会导入 App 和插件的 Server plugin 声明模块，因此
`server/plugin.ts` 及其直接声明依赖的顶层代码不得启动服务、连接数据库或执行任务。
Inspector 不会构造 Provider、执行 lifecycle、调用 Route factory、连接数据库、启动
Worker 或加载 Job module。检查 `issues`；输出只表示 declaration composition 和
resolved contribution locations。Provider constructor name 只是用于定位源码的 best-effort
调试标签，Route 权限及其他运行时行为仍需行为测试。

## 常见错误与完成条件

避免：在 Route 中复制领域逻辑；重建别的插件的 Token；把 API 路径写成 `/api/api/...`；把 Server routes 写成 loader；只改源码不改 exports 或 composition root。

完成时应能从 `server/plugin.ts` 追踪到所有实际 contributions，测试覆盖行为，目标 App 显式注册正确，且 App-facing 能力变化已更新 `skills/`。
