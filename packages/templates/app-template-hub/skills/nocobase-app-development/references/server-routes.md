# Server routes

HTTP endpoints live in `server/routes/` and are listed in the array `server/routes/index.ts` exports, which `server/runtime.ts` passes to the application.

## Two kinds

| Function             | Path in code     | Final URL        | For                                              |
| -------------------- | ---------------- | ---------------- | ------------------------------------------------ |
| `defineApiRoutes()`  | `/orders`        | `/api/orders`    | Application APIs the browser calls               |
| `defineRootRoutes()` | `/callbacks/pay` | `/callbacks/pay` | Webhooks, OAuth callbacks, protocol entry points |

Do not repeat `/api` in the path, and never write the deployment base path such as `/main` — both are added by the runtime.

## An authenticated endpoint

```ts
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const orders = app.container.resolve(orderServiceToken);

    router.use('/orders', auth.required());
    router.get('/orders', async (context) =>
      context.json({ data: await orders.list() }),
    );

    return router;
  },
);
```

The factory creates and returns its own router. Resolve dependencies from `app.container` inside the factory.

## Every route owns its own security

**Mounting under `/api` does not authenticate anything.** `/api` is a location. A route with no `auth.required()` is public regardless of where it mounts.

Never depend on middleware installed by another route, or on the order contributions happen to be registered in. Contribution order changes when a plugin is added, and a route protected only by someone else's middleware silently becomes public.

`auth.required()` rejects anonymous requests with `401`. `auth.optional()` attaches the session when present without rejecting.

## Authorization, when identity is not enough

Authentication answers who is calling. Authorization answers whether they may perform this action. Sensitive operations need both:

```ts
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';

export const orderAdminRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);

    routes.use('*', auth.required(), authorization.middleware());
    routes.get('/', async (context) => {
      const allowed = await context.get('authz').can({
        resource: { type: 'database.collection', id: 'main.orders' },
        action: 'read',
      });
      if (!allowed) {
        return context.json({ error: 'Not allowed.' }, 403);
      }

      return context.json({ data: await listOrders() });
    });

    router.route('/orders-admin', routes);
    return router;
  });
```

Use a stable `resource`/`action` pair per operation — `read` and `create` are distinct decisions.

### When the answer is not yes or no

`can()` answers whether the caller may perform the action at all. Many real requirements are narrower than that: _a salesperson may only see the customers they own_. There the answer is neither yes nor no — it is "yes, for these rows, and these fields".

`policyFor()` returns that. It folds this request's read, create, update and delete decisions into one Repository Policy, and `withPolicy()` binds it:

```ts
const policy = await authz.database.policyFor(
  'main.customers',
  context.get('authz'),
);
if (policy.read === false) return context.json({ code: 'FORBIDDEN' }, 403);

const customers = database.repository('customers').withPolicy(policy);
return context.json({ data: await customers.findMany() });
```

**Let the Policy do the filtering.** The bound Repository puts the row scope in the same `WHERE` clause as everything else and refuses a field outside the allowlist, on reads and on writes alike. Fetching rows and filtering them in memory afterwards is not an implementation detail — it is a data leak whenever a bug, an early return, or a later refactor skips the filter. A row outside the scope makes `updateOne` raise `RECORD_NOT_FOUND`, which is a 404: indistinguishable from a row that does not exist, which is the point.

A denied action is `false` on its node, so a route reads the Policy for its own status code rather than re-deriving the decision.

Nothing registers the collection. Field names, the primary key, and whether the database generates it are read from db's own Collection metadata, so any collection a migration created can be granted on. `recordsIOwn` and `recordsICreated` take the column to compare as `params.field`, defaulting to `ownerId` and `createdById`.

### Repository API endpoints

When a route exposes a collection through `defineRepositoryApiRoutes()` rather than a handler of its own, `authorization.repositories()` authorizes it in place. Each exposure names the `resource` its rows belong to and declares the static Policy shape it offers; the middleware narrows that shape with the caller's grants:

```ts
const authorize = authorization.repositories(repositories);
for (const action of ['findMany', 'createOne'])
  router.use(`/orders:${action}`, auth.required(), authorize);
router.route(
  '/',
  await defineRepositoryApiRoutes({
    principal: authorize.principal,
    repositories: authorize.repositories,
  }).createRouter(app),
);
```

Mount it on every action of every exposure that names a `resource`. An action it did not run on resolves no principal, and app-server answers `403 PRINCIPAL_REQUIRED` rather than falling back to the shape. Relation rules come from the shape — a grant carries no relation model, and a member it does not mention stays as it was — so write `read` out as a node with its `fields` and `relations` rather than `true` when relations must stay readable.

This is a summary. Configuring Permission Sets and binding the Repository Policy that `policyFor()` returns are covered by the authorization plugin's own Skill — read `nocobase-app-plugin-authorization` in `.agents/skills/` before building ownership rules, and its `references/orders-module.md` for a complete worked example with an `ownerId`. For a worked plugin, `@nocobase/app-plugin-authorization-example` puts an authorized Repository API and an owner-stamping route over a single collection.

## Scope middleware to paths you own

Use the explicit path, or an isolated sub-router mounted at your prefix as above. A `router.use('*', ...)` on the top-level router leaks into contributions mounted later and is the way an unrelated endpoint accidentally becomes protected — or, worse, the way yours accidentally is not.

## Deliberately public routes

A third-party webhook cannot present a login session, so it is public by design. Public still requires a security boundary:

```ts
router.post('/callbacks/payment', async (context) => {
  const signature = context.req.header('x-payment-signature');
  const body = await context.req.text();

  if (!signature || !verify(body, signature)) {
    return context.json({ code: 'INVALID_SIGNATURE' }, 401);
  }

  await acceptPayment(body);
  return context.json({ accepted: true }, 202);
});
```

Verify the signature, and handle timestamps, replay protection, and idempotency as the third-party protocol requires. Record in a comment why the route is public. Test anonymous requests with a missing signature, a wrong signature, a valid signature, and a duplicate delivery.

## Structuring larger routes

One or two handlers belong directly in the factory. When a domain grows several handlers or shared error handling, extract a function that returns its own `Hono` and mount it:

```ts
export function createOrderRoutes(options: CreateOrderRoutesOptions): Hono {
  const routes = new Hono();
  routes.use('*', options.auth.required());
  routes.get('/', async (context) =>
    context.json({ data: await options.orders.list() }),
  );
  return routes;
}
```

Do not write a helper that mutates a router passed in by its caller. Returning a router you own keeps the security boundary inside the thing being tested.

## Keep the layers apart

Routes handle HTTP: parsing input, checking permission, shaping the response and status. Domain logic goes in a service under `server/providers/` — see [services and jobs](services-and-jobs.md). A service should not read a Hono context or decide status codes.

## Registering

Export the contributions in order from `server/routes/index.ts`:

```ts
const routes: readonly AppRouteContribution<Application>[] = [
  apiRoutes,
  rootRoutes,
];

export default routes;
```

Declaration modules must not connect to the database, start workers, or execute route factories at import time. `server:inspect` imports them.

## Calling from the browser

Resolve `apiClientToken` and use the application's own HTTP client, so the request follows the configured API base URL:

```tsx
const api = useService(apiClientToken);
const data = await api.request<OrderList>({ path: 'orders' });
```

The path is relative to `/api`. Do not build the URL by hand or use bare `fetch` — the base path differs between development and deployment.

## Verify

- An anonymous request returns `401`.
- An authenticated request without permission returns `403`.
- A caller restricted to their own records cannot read, update, or delete someone else's — verified by request, not by reading the code.
- A permitted request returns the expected payload.
- Middleware does not leak into other routes.
- A public route rejects missing and invalid signatures, and handles duplicate delivery.
