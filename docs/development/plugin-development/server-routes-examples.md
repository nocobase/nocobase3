---
title: Server Route 最佳实践示例
description: NocoBase v3 插件中 Root Route、API Route、安全边界、复杂子路由、组合和行为测试的示例
---

# Server Route 最佳实践示例

NocoBase v3 的 Server Route 是由插件直接贡献给应用的 Hono router：

- `defineApiRoutes()` 创建挂载在 `/api` 下的业务 API；
- `defineRootRoutes()` 创建不带 `/api` 前缀的顶层 HTTP 入口；
- Route factory 自己创建并返回 router，并从 `container` 解析依赖；
- 每个 contribution 拥有自己的显式安全策略；需要登录或权限时，自己安装 authentication 和 authorization；
- `server/routes/index.ts` 统一组合 contributions，`server/plugin.ts` 再把它们交给应用。

下面的示例只展示 Server Route。完整的跨 Client/Server 选择规则见
[Route 插件开发](./routes.md)，Service、Provider 和 Server 插件组合规则见
[Server 模块选择](./server.md)。

## 先选择 Root Route 还是 API Route

| 场景                 | Route API            | 源码中的路径        | 最终应用路径            |
| -------------------- | -------------------- | ------------------- | ----------------------- |
| 登录用户访问订单 API | `defineApiRoutes()`  | `/orders`           | `/api/orders`           |
| 第三方支付回调       | `defineRootRoutes()` | `/callbacks/pay`    | `/callbacks/pay`        |
| OAuth callback       | `defineRootRoutes()` | `/oauth/callback`   | `/oauth/callback`       |
| 插件管理 API         | `defineApiRoutes()`  | `/example/settings` | `/api/example/settings` |

Route 中不要重复写宿主提供的 `/api`、App public base path 或 App name。部署时的
public base path 由宿主统一恢复。

## 示例一：受认证保护的 API Route

简单 Route 直接写在 `defineApiRoutes()` factory 中。不要为了测试再增加一个
`registerExampleRoutes(router, authentication): void` 包装层。

```ts
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { orderServiceToken } from '../tokens.js';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const authentication = container.resolve(authenticationToken);
    const orders = container.resolve(orderServiceToken);

    router.use('/orders', authentication.required());
    router.get('/orders', async (context) =>
      context.json({ data: await orders.list() }),
    );

    return router;
  });
```

这个 contribution 最终提供 `GET /api/orders`。`/api` 只表示挂载位置，不代表已经
认证，所以 authentication middleware 必须由这个 Route 自己安装。

对于只有一两个 handler 的 Route，把声明、依赖解析和 HTTP 行为放在同一个 factory
中最容易阅读。领域查询仍放在 `OrderService` 中，Route 只负责 HTTP 输入、权限检查和
响应映射。

## 示例二：Root Route 拥有独立的安全边界

Root Route 不会继承另一个 API contribution 的认证。即使同一插件已经定义了受保护的
API Route，Root Route 仍然必须明确声明自己的安全策略。

```ts
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineRootRoutes,
  type AppRootRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

export const rootRoutes: AppRootRouteContribution<AppPluginApplication> =
  defineRootRoutes(({ container }) => {
    const router = new Hono();
    const authentication = container.resolve(authenticationToken);

    router.use('/routes-example/root', authentication.required());
    router.get('/routes-example/root', (context) =>
      context.json({
        scope: 'root',
        plugin: '@nocobase/app-plugin-routes-example',
      }),
    );

    return router;
  });
```

这个 contribution 最终提供 `GET /routes-example/root`。middleware 使用 Route
实际拥有的明确路径，避免 `router.use('*', ...)` 在组合后影响其他 contribution。

## 示例三：有意公开的 webhook 或 callback

第三方系统通常无法使用 NocoBase 登录会话，因此 webhook 可以是有意公开的 Root
Route，但“公开”不等于“没有安全边界”。它应校验签名、时间戳或一次性 state，并只
返回必要信息。

```ts
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineRootRoutes,
  type AppRootRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { paymentWebhookServiceToken } from '../tokens.js';

export const paymentCallbackRoutes: AppRootRouteContribution<AppPluginApplication> =
  defineRootRoutes(({ container }) => {
    const router = new Hono();
    const webhooks = container.resolve(paymentWebhookServiceToken);

    router.post('/callbacks/payment', async (context) => {
      const signature = context.req.header('x-payment-signature');
      const body = await context.req.text();

      if (!signature || !webhooks.verify(body, signature)) {
        return context.json(
          { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' },
          401,
        );
      }

      await webhooks.accept(body);
      return context.json({ accepted: true }, 202);
    });

    return router;
  });
```

该 Route 没有安装登录 authentication middleware，因为其调用方是第三方支付系统；
签名验证就是它有意选择的认证边界。测试应至少覆盖缺少签名、错误签名、有效签名和
重复投递。真实实现还应限制请求体大小，并根据第三方协议处理重放保护和幂等性。

## 示例四：同时检查 authentication 和 authorization

authentication 只回答“请求者是谁”，authorization 才回答“请求者能否执行这个业务
动作”。敏感 API 通常需要两者。

当一组子路由共享相同安全策略时，可以创建一个子 router，在子 router 内使用
`'*'`，再把它挂载到插件拥有的明确前缀。这样安全边界不会扩散到其他 contribution。

```ts
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { orderServiceToken } from '../tokens.js';

export const orderAdminRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const orders = container.resolve(orderServiceToken);

    routes.use('*', authentication.required(), authorization.middleware());
    routes.get('/', async (context) => {
      await context.get('authz').require({
        resource: { type: 'database.collection', id: 'main.orders' },
        action: 'read',
      });

      return context.json({ data: await orders.list() });
    });

    routes.post('/', async (context) => {
      await context.get('authz').require({
        resource: { type: 'database.collection', id: 'main.orders' },
        action: 'create',
      });

      return context.json(
        { data: await orders.create(await context.req.json()) },
        201,
      );
    });

    router.route('/order-admin', routes);
    return router;
  });
```

测试至少覆盖以下结果：

- 未登录请求返回 `401`；
- 已登录但没有对应 action 的请求返回 `403`；
- 具有权限的请求执行 Service 并返回预期结果；
- `read` 和 `create` 使用各自稳定的 resource/action；
- 同一 App 中较晚注册的 Route 不受这个子 router 的 middleware 影响。

## 示例五：复杂 Route 使用返回 `Hono` 的 router factory

当一个业务域包含多个 handler、共享错误处理或需要独立单元测试时，可以抽取一个有
明确领域含义的 router factory。它接收需要的依赖并返回它自己拥有的 `Hono`，而不是
接收并修改调用方的 router。

```ts
// server/routes/orders.ts
import type { Auth } from '@nocobase/app-plugin-authentication';
import { Hono } from 'hono';

import type { OrderService } from '../tokens.js';

export interface CreateOrderRoutesOptions {
  readonly authentication: Auth;
  readonly orders: OrderService;
}

export function createOrderRoutes(options: CreateOrderRoutesOptions): Hono {
  const routes = new Hono();

  routes.use('*', options.authentication.required());
  routes.get('/', async (context) =>
    context.json({ data: await options.orders.list() }),
  );
  routes.get('/:id', async (context) => {
    const order = await options.orders.find(context.req.param('id'));
    return order
      ? context.json({ data: order })
      : context.json(
          { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
          404,
        );
  });

  return routes;
}
```

```ts
// server/routes/index.ts
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { orderServiceToken } from '../tokens.js';
import { createOrderRoutes } from './orders.js';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    router.route(
      '/orders',
      createOrderRoutes({
        authentication: container.resolve(authenticationToken),
        orders: container.resolve(orderServiceToken),
      }),
    );
    return router;
  });
```

推荐使用 `createOrderRoutes(options): Hono` 的条件是抽取后形成了清晰、可独立测试的
业务子路由。只有一个简单 handler 时，直接写在 contribution factory 中通常更清楚。
这是一种插件内部代码组织方式，不是框架新增的 Route API；框架契约仍然是
`defineApiRoutes()`、`defineRootRoutes()` 以及 contribution 的 `createRouter()`。

避免把下面这种测试辅助写法当成标准 Route API：

```ts
// Avoid: it mutates a router owned by the caller and adds an unnecessary API.
export function registerOrderRoutes(router: Hono, authentication: Auth): void {
  router.use('/orders', authentication.required());
  router.get('/orders', handler);
}
```

## 组合 Root 和 API contributions

Root 和 API Route 可以放在不同文件中，再由 `server/routes/index.ts` 导出一个有明确
顺序的数组：

```ts
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import type { AppRouteContribution } from '@nocobase/app-server-kit/router';

import { apiRoutes } from './api.js';
import { rootRoutes } from './root.js';

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  rootRoutes,
  apiRoutes,
];

export default routes;
```

`server/plugin.ts` 直接消费这个数组，不使用 Route loader：

```ts
import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import routes from './routes/index.js';

const plugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-orders',
  routes,
});

export default plugin;
```

声明模块的顶层代码只创建 definitions，不启动服务、不连接数据库，也不执行 Route
factory。`server:inspect` 会导入这些模块，但不会调用 `createRouter()`。

## 直接测试 contribution 的 `createRouter()`

简单 Route 不需要为了测试导出 `register...` helper。可以在测试容器中注册替代服务，
然后直接调用实际 contribution 的 `createRouter()`。

```ts
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { rootRoutes } from '../server/routes/root.js';

describe('root routes', () => {
  it('rejects an anonymous request at its own boundary', async () => {
    const container = new ServiceContainer();
    container.instance(authenticationToken, {
      required: () => (context) =>
        Promise.resolve(
          context.json(
            { code: 'UNAUTHORIZED', message: 'Authentication required' },
            401,
          ),
        ),
    } as Auth);

    const router = await rootRoutes.createRouter({
      appName: 'main',
      publicBasePath: '/main',
      config: { app: { name: 'main', publicBasePath: '/main' } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      router: new Hono(),
      container,
    });

    const response = await router.request('/routes-example/root');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  });
});
```

这种测试执行的就是生产环境使用的 Route factory，因此能验证依赖解析、middleware
安装和 handler 行为。它仍然是 contribution 级测试；最终路径前缀、多个 contributions
的顺序和 public base path 应再通过真实 `Application` 组合测试验证。

## 验证清单

本页规则面向 `packages/app-plugin-*/server/routes/` 中的插件 Route contribution。
`app-server-kit` 内部的 SPA、WebSocket 或其他 runtime router helper 有自己的所有权和
测试边界，不应因为命名相似而被机械改写。

- 根据最终 URL 明确选择 `defineApiRoutes()` 或 `defineRootRoutes()`；
- Route factory 创建并返回自己拥有的 router；
- 从 `container` 解析能力所有者导出的原始 Token，不重建同名 Token；
- 每个 contribution 明确拥有 authentication 和 authorization 边界；
- 有意公开的 Route 记录公开原因，并测试匿名请求和替代安全机制；
- middleware 只覆盖插件拥有的明确路径或隔离的子 router；
- HTTP 逻辑留在 Route，领域逻辑放入 Service；
- 简单 Route 直接声明，复杂业务域才抽取返回 `Hono` 的 router factory；
- 测试覆盖匿名、无权限、允许访问、错误输入和 middleware 不泄漏；
- `server/routes/index.ts` 导出直接 contributions，`server/plugin.ts` 不使用 loader；
- 运行插件的 `lint`、`typecheck`、`test` 和 `build`，并运行目标 App 的
  `server:inspect --json` 和相关集成测试。

返回[Route 插件开发](./routes.md)，或继续阅读[测试和验证插件](./testing.md)和
`packages/app-plugin-routes-example` 的可运行四 Route 示例。
