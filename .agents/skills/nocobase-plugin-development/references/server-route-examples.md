# Server Route examples

Use these examples when the concise rules in [Server development](./server.md) are not enough. They follow the current NocoBase v3 `defineApiRoutes()`, `defineRootRoutes()`, `Auth`, and `AppAuthorization` contracts on `develop`.

## Choose the mount scope first

| Requirement                  | Route API            | Source path          | Mounted application path |
| ---------------------------- | -------------------- | -------------------- | ------------------------ |
| Signed-in business API       | `defineApiRoutes()`  | `/orders`            | `/api/orders`            |
| Plugin administration API    | `defineApiRoutes()`  | `/order-admin`       | `/api/order-admin`       |
| Signed-in top-level entry    | `defineRootRoutes()` | `/orders/export`     | `/orders/export`         |
| Third-party payment callback | `defineRootRoutes()` | `/callbacks/payment` | `/callbacks/payment`     |

Do not repeat `/api`, the App name, or the deployment public base path in a contribution path. The host restores its public base path when it mounts the App.

Route scope does not supply security. Each contribution installs and tests its own authentication and authorization, or implements and tests an explicit public protocol boundary.

## Define the service contracts and Tokens

The examples keep reusable behavior behind service interfaces. A Route owns HTTP input, status codes, authentication, authorization, and error mapping; it delegates domain work to a service resolved from the container.

```ts
// server/tokens.ts
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface OrderRecord {
  readonly id: string;
  readonly reference: string;
}

export interface CreateOrderInput {
  readonly reference: string;
}

export interface OrderService {
  list(): Promise<readonly OrderRecord[]>;
  create(input: CreateOrderInput): Promise<OrderRecord>;
}

export interface PaymentDelivery {
  readonly deliveryId: string;
  readonly rawBody: string;
}

export interface PaymentSignatureInput extends PaymentDelivery {
  readonly signature: string;
  readonly timestamp: string;
}

export interface PaymentWebhookService {
  verify(input: PaymentSignatureInput): Promise<boolean>;
  accept(delivery: PaymentDelivery): Promise<'accepted' | 'duplicate'>;
}

export const orderServiceToken: ServiceToken<OrderService> =
  createServiceToken<OrderService>('@nocobase/app-plugin-orders/order-service');

export const paymentWebhookServiceToken: ServiceToken<PaymentWebhookService> =
  createServiceToken<PaymentWebhookService>(
    '@nocobase/app-plugin-orders/payment-webhook-service',
  );
```

The provider that owns a capability creates and exports its Token. Consumers import that exact Token; creating another Token with the same string produces a different container key.

## Authenticated API Route

A small Route is clearest when its factory resolves dependencies, installs middleware on an explicit owned path, and declares the handlers directly.

```ts
// server/routes/api.ts
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
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

This contribution provides `GET /api/orders`. The `/api` mount distinguishes an application API from a top-level entry; it does not authenticate the request.

Authentication answers who the caller is. This read endpoint deliberately permits every signed-in user. Add authorization when the business action is restricted.

## Independently protected Root Route

A Root contribution does not inherit middleware from an API contribution in the same plugin. Install authentication again on the Root path that requires it.

```ts
// server/routes/root.ts
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineRootRoutes,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

export const rootRoutes: AppRootRouteContribution<AppPluginApplication> =
  defineRootRoutes(({ container }) => {
    const router = new Hono();
    const authentication = container.resolve(authenticationToken);

    router.use('/orders/export', authentication.required());
    router.get('/orders/export', (context) =>
      context.json({ downloadUrl: '/temporary/orders.csv' }),
    );

    return router;
  });
```

Use an explicit owned path instead of contribution-wide `router.use('*', ...)`. Hono routers are composed in order, so wildcard middleware on a router mounted at a shared scope can affect a later contribution.

## Public callback with a real protocol boundary

A third-party webhook cannot normally present a NocoBase session. It may therefore be intentionally public from the application's session perspective, while still authenticating the sender with the third party's protocol.

```ts
// server/routes/payment-callback.ts
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineRootRoutes,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { paymentWebhookServiceToken } from '../tokens.js';

export const paymentCallbackRoutes: AppRootRouteContribution<AppPluginApplication> =
  defineRootRoutes(({ container }) => {
    const router = new Hono();
    const webhooks = container.resolve(paymentWebhookServiceToken);

    router.post('/callbacks/payment', async (context) => {
      const signature = context.req.header('x-payment-signature');
      const timestamp = context.req.header('x-payment-timestamp');
      const deliveryId = context.req.header('x-payment-delivery-id');
      const rawBody = await context.req.text();

      if (!signature || !timestamp || !deliveryId) {
        return context.json(
          {
            code: 'INVALID_PAYMENT_CALLBACK',
            message: 'Payment callback headers are incomplete',
          },
          401,
        );
      }

      const verified = await webhooks.verify({
        signature,
        timestamp,
        deliveryId,
        rawBody,
      });
      if (!verified) {
        return context.json(
          {
            code: 'INVALID_PAYMENT_SIGNATURE',
            message: 'Payment callback signature is invalid',
          },
          401,
        );
      }

      const result = await webhooks.accept({ deliveryId, rawBody });
      return context.json(
        { accepted: result === 'accepted', duplicate: result === 'duplicate' },
        result === 'accepted' ? 202 : 200,
      );
    });

    return router;
  });
```

The service should compare signatures safely, reject timestamps outside the protocol window, prevent replay, and persist idempotency by `deliveryId`. Apply a request-body limit before buffering untrusted payloads. Keep provider-specific secrets out of logs and responses.

Test missing headers, an invalid signature, an expired or replayed delivery, a valid delivery, and a duplicate. The duplicate response should follow the provider's retry contract and must not repeat the business side effect.

## Authentication and authorization in an isolated child router

When a domain has several handlers with one security policy, create a child router and mount it below one plugin-owned prefix. This is the appropriate place for `router.use('*', ...)` because the wildcard is isolated inside the child router.

```ts
// server/routes/order-admin.ts
import type { Auth } from '@nocobase/app-plugin-authentication';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import {
  AuthorizationDeniedError,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import { Hono } from 'hono';

import type { CreateOrderInput, OrderService } from '../tokens.js';

export interface CreateOrderAdminRoutesOptions {
  readonly authentication: Auth;
  readonly authorization: AppAuthorization;
  readonly orders: OrderService;
}

export function createOrderAdminRoutes(
  options: CreateOrderAdminRoutesOptions,
): Hono<AuthorizationEnv> {
  const routes = new Hono<AuthorizationEnv>();

  routes.onError((error, context) => {
    if (error instanceof AuthorizationDeniedError) {
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
    }
    throw error;
  });
  routes.use('*', options.authentication.required());
  routes.use('*', options.authorization.middleware());

  routes.get('/', async (context) => {
    await context.get('authz').require({
      resource: { type: 'database.collection', id: 'main.orders' },
      action: 'read',
    });
    return context.json({ data: await options.orders.list() });
  });

  routes.post('/', async (context) => {
    await context.get('authz').require({
      resource: { type: 'database.collection', id: 'main.orders' },
      action: 'create',
    });
    const input = parseCreateOrderInput(await context.req.json());
    return context.json({ data: await options.orders.create(input) }, 201);
  });

  return routes;
}

function parseCreateOrderInput(value: unknown): CreateOrderInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Order input must be an object');
  }
  const reference = Reflect.get(value, 'reference');
  if (typeof reference !== 'string' || reference.trim().length === 0) {
    throw new TypeError('Order reference is required');
  }
  return { reference: reference.trim() };
}
```

The current authorization middleware reads the session set by `Auth.required()`, establishes the request identity, and stores an `AuthorizationScope` in `context.get('authz')`. Install middleware in that order. `require()` throws `AuthorizationDeniedError` for a denied decision, so the HTTP boundary must map it to `403` or rely on an App-owned equivalent error mapper.

The child router is still plugin-owned code, not a new framework contribution API. The framework contribution resolves the owner-exported Tokens and mounts the returned `Hono`.

```ts
// server/routes/order-admin-contribution.ts
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { orderServiceToken } from '../tokens.js';
import { createOrderAdminRoutes } from './order-admin.js';

export const orderAdminRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    router.route(
      '/order-admin',
      createOrderAdminRoutes({
        authentication: container.resolve(authenticationToken),
        authorization: container.resolve(authorizationToken),
        orders: container.resolve(orderServiceToken),
      }),
    );
    return router;
  });
```

Do not add a `registerOrderRoutes(router, dependencies): void` helper that mutates a router owned by its caller solely to make tests convenient. A domain factory that returns its own `Hono` is independently testable, and the production contribution itself exposes `createRouter()` for wiring tests.

## Compose the contributions

Keep Root and API contributions in a stable array. The Server plugin consumes the array directly; there is no Route loader.

```ts
// server/routes/index.ts
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes } from './api.js';
import { orderAdminRoutes } from './order-admin-contribution.js';
import { paymentCallbackRoutes } from './payment-callback.js';
import { rootRoutes } from './root.js';

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  rootRoutes,
  paymentCallbackRoutes,
  apiRoutes,
  orderAdminRoutes,
];

export default routes;
```

`server/plugin.ts` supplies an absolute `baseDir`, package identity, providers, and the direct Route array. Declaration modules must remain import-safe: top-level code creates definitions and arrays, but does not resolve services or execute a Route factory.

```ts
// server/plugin.ts
import path from 'node:path';

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const plugin: AppServerPlugin = defineServerPlugin({
  baseDir: path.resolve(import.meta.dirname, '..'),
  packageName: '@nocobase/app-plugin-orders',
  serviceProviders,
  routes,
});

export default plugin;
```

## Test the production contributions

Call each exported contribution's real `createRouter()` with a complete `AppPluginApplication`. The following focused test uses the real `Auth` class with an in-memory SQLite connection and substitutes only `getSession()` to select anonymous behavior without unsafe partial-class casts.

```ts
// tests/routes.test.ts
import { Auth, authenticationToken } from '@nocobase/app-plugin-authentication';
import { createConfigPaths } from '@nocobase/app-server/config';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { apiRoutes } from '../server/routes/api.js';
import { rootRoutes } from '../server/routes/root.js';
import { orderServiceToken } from '../server/tokens.js';

describe('order Route contributions', () => {
  it('owns both authentication boundaries without middleware bleed', async () => {
    const database = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    try {
      const authentication = new Auth({
        connection: database.connection(),
        baseURL: 'http://example.test',
        secret: 'route-example-test-secret-at-least-32-characters',
      });
      vi.spyOn(authentication, 'getSession').mockResolvedValue(null);

      const container = new ServiceContainer();
      container.instance(authenticationToken, authentication);
      container.instance(orderServiceToken, {
        list: async () => [{ id: 'order-1', reference: 'SO-1000' }],
        create: async (input) => ({ id: 'order-2', ...input }),
      });

      const application = new Hono();
      const app: AppPluginApplication = {
        appName: 'main',
        publicBasePath: '',
        config: { app: { name: 'main', publicBasePath: '' } },
        paths: createConfigPaths({ rootDir: '/tmp/order-route-example' }),
        router: application,
        container,
      };
      application.route('/api', await apiRoutes.createRouter(app));
      application.route('/', await rootRoutes.createRouter(app));
      application.get('/api/later-plugin', (context) => context.text('later'));

      expect((await application.request('/api/orders')).status).toBe(401);
      expect((await application.request('/orders/export')).status).toBe(401);
      await expect(
        (await application.request('/api/later-plugin')).text(),
      ).resolves.toBe('later');
    } finally {
      await database.destroy();
    }
  });
});
```

This test builds a complete application object and runs the same contribution factories used in production. It avoids a test-only `register...` API and avoids pretending that a partial object is an `Auth` instance.

Add focused tests for authenticated success, `AuthorizationDeniedError` to `403` mapping, each resource/action pair, invalid JSON input, callback signature and replay behavior, and service calls. Add a target App integration test for final public-base-path mounting, real sign-in cookies, persisted grants, and multi-plugin composition. The maintained sources below contain larger test suites when the focused pattern is not enough.

## Current maintained source

- [Runnable Root and API contribution implementations](../../../../packages/examples/app-plugin-routes-example/server/routes)
- [Production `createRouter()` contribution tests and middleware-leak check](../../../../packages/examples/app-plugin-routes-example/tests/routes.test.ts)
- [Typed real-`Auth` test fixture backed by SQLite](../../../../packages/examples/app-plugin-repository-example/tests/helpers.ts)
- [Authentication middleware and `AuthEnv`](../../../../packages/plugins/app-plugin-authentication/server/auth.ts)
- [Authorization middleware, error mapping, and protected handlers](../../../../packages/plugins/app-plugin-authorization/server/routes/authorization.ts)
- [Route contribution contracts](../../../../packages/app/app-server/src/router/routes.ts)

When these implementations change, update the examples to match the exported APIs rather than preserving an obsolete snippet.
