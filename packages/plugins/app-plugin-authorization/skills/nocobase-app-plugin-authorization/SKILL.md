---
name: nocobase-app-plugin-authorization
description: 'Add authorization to a NocoBase 3 application or plugin: register resources, protect routes and Repository API endpoints, apply database field and record conditions to queries, configure Permission Sets, and diagnose a permission decision.'
metadata:
  short-description: Add authorization to a NocoBase 3 application
  domain-owner: '@nocobase/app-plugin-authorization'
---

# Authorization development

Use this skill when a coding agent needs to add authorization to a NocoBase
module or configure business permissions for an installed module. The goal is
to keep business code calling its own API while authorization runs at the
boundary of that API.

For a complete end-to-end implementation, read
[references/orders-module.md](references/orders-module.md). It is a compact
Orders module example covering schema, service, routes, and all four database
access-range features.

## Choose the right layer

- Use `authz.resources.add()` when a module owns a new resource type and needs
  to define how that resource is authorized.
- Use `authz.db.repositories()` when a module exposes collections through
  `defineRepositoryApiRoutes()`. It authorizes each endpoint in place and
  registers the collections its exposures name.
- Use `authz.guard()` for an HTTP route or action that needs one authorization
  check before the handler runs.
- Use `authz.db.policyFor()` when the handler reads or writes a registered
  collection: it returns a Repository Policy to bind with
  `repository.withPolicy()`.
- Use `context.get('authz').authorize()` when a handler needs one action's raw
  decision rather than a Policy.
- Use Permission Sets and the authorization settings API/UI for business
  configuration. Do not hard-code end-user assignments in a feature route.

Do not add a second permission system inside a module. The module should keep
its normal service/repository API and add an authorization check immediately
before the operation.

## Register the collections the module governs

Database authorization is built in — an application no longer lists it among
its plugins — and it is reached as `authz.db`.

```ts
const authz = createAppAuthorization({
  connection,
  config: {
    plugins: [defaultAccess(), sharingRules(), restrictionRules()],
  },
});

authz.db.collections.add({ name: 'orders', title: 'Orders' });
```

Registration is the opt-in into the permission model, and it carries intent
only: a name, plus an optional `title` and `description` for the permission
UI. Field names, the primary key, and whether the database generates it are
still read from `connection.collections` at authorize time. Registering the
same thing twice is a no-op — boot runs more than once in some hosts — while a
second registration that disagrees throws.

Nothing registers a collection for you. `authz.db.repositories()` narrows
Policies and registers nothing, so a collection exposed over HTTP still needs
its own `add()`; that is what gives it the title the permission UI shows. Put
that call in the service provider that owns the module, at boot — a route file
builds routes and should carry no registration of its own.

**An unregistered collection has no permission.** The request is denied with
`COLLECTION_NOT_REGISTERED` before any metadata or grant lookup, for an
unrestricted identity too — a superuser bypasses grants, not the model. This
is what keeps system and bookkeeping tables out of the permission UI and out
of every grant.

- The resource id is the registered collection name — `orders`, with no
  connection prefix. The plugin reads one connection.
- The actions are fixed: `read`, `create`, `update`, `delete`.
- Fields are the collection's own columns. Relations are governed by a
  Repository Policy's `relations`, not by a field list.
- `recordsIOwn` and `recordsICreated` take the column to compare as
  `params.field`, defaulting to `ownerId` and `createdById`.

An unregistered collection, a collection db does not hold, an action outside
those four, and a field the collection does not have are each denied.

## Protect a module API

The module still calls its own service or repository. Authorization supplies
the constraints used by that service; it does not replace the service.

```ts
routes.get('/orders', async (context) => {
  const policy = await authz.db.policyFor('orders', context.get('authz'));
  if (policy.read === false) return context.json({ code: 'FORBIDDEN' }, 403);
  const orders = database.repository('orders').withPolicy(policy);
  return context.json({ data: await orders.findMany() });
});
```

The authorization resource id in this example is the collection name itself:

```ts
resource: { type: 'database.collection', id: 'orders' }
```

For routes where only a yes/no decision is needed, use the guard middleware.
For example, a module that registers a `reports` resource can protect its
export endpoint like this:

```ts
routes.use(
  '/reports/:id/export',
  authz.guard((context) => ({
    resource: {
      type: 'reports',
      id: context.req.param('id'),
    },
    action: 'export',
  })),
);
```

The application must run `authz.middleware()` before the guard. It resolves the
request principal and subjects from the authentication session and from any
other step registered with `authz.use()`.

## Apply database conditions safely

`policyFor()` folds this request's read, create, update and delete decisions
into one `RepositoryPolicy`: a denied action is `false`, an unconditional one
`true`, and a conditional one `{ scope, fields }`. Binding it with
`withPolicy()` is what makes the record scope and the field allowlist part of
every statement — there is nothing left for the service to compile or check by
hand, and no window in which a record is fetched, checked in memory, and then
written without its scope.

```ts
const orders = database
  .repository('orders')
  .withPolicy(await authz.db.policyFor('orders', scope));

await orders.updateOne({ filter: { id }, values: input });
```

A row outside the scope raises `RECORD_NOT_FOUND`, which a route turns into a 404. A write grant must name every column the route stores, timestamps
included; a generated primary key is not writable, so list the columns rather
than granting `input: '*'`.

## Protect Repository API routes

When the module exposes collections with `defineRepositoryApiRoutes()`,
`authz.db.repositories()` authorizes them without a handler of its own. Each
exposure that names a `resource` declares the static Policy it offers; the
middleware narrows that shape with the caller's grants per request, and each
named collection is registered at definition time.

```ts
const authorize = authorization.db.repositories(repositories);
router.use('/orders:findMany', authentication.required(), authorize);
router.route(
  '/',
  await defineRepositoryApiRoutes({
    principal: authorize.principal,
    repositories: authorize.repositories,
  }).createRouter(app),
);
```

- Mount the middleware on every action of every exposure that names a
  `resource`. An action it did not run on resolves no principal, and
  app-server answers `403 PRINCIPAL_REQUIRED` rather than falling back to the
  shape.
- A grant carries no relation model, and a member the grant does not mention
  stays as it was — so relation rules come from the shape while scope and
  fields are intersected with the grant. Write `read` out as a node with its
  `fields` and `relations`; `read: true` narrows to a node with no readable
  relations.
- An exposure that names a `resource` needs a static `policy`. A function
  throws a `TypeError` where the routes are defined.
- An exposure with no `resource` is passed through and never consults
  authorization.

`@nocobase/app-plugin-authorization-example` is the runnable reference: one
owned collection, its Repository API endpoints authorized by name, and a
hand-written create route that stamps the owner from the principal.

## Configure business permissions

Permission configuration has two parts:

1. The module declares the resources and endpoints it authorizes in code.
2. An administrator assigns Permission Sets and configures database rules.

Use a Permission Set when the same access should be reused for several users,
roles, or other subjects. Put the database resource and its actions in the
grant, then configure fields and record access per action. Use Default Access
for a collection-wide baseline, Sharing Rules to expand access for selected
subjects, and Restriction Rules to narrow effective access.

The settings API uses the same authorization instance as application code:

```ts
const permissionSet = await authz.permissionSets.create({
  key: 'orders-manager',
  title: 'Orders manager',
  grants: [
    authz.db.grant('orders', {
      read: {
        fields: { output: ['id', 'number', 'amount', 'status'] },
        recordAccess: ['allRecords'],
      },
    }),
  ],
});

await authz.permissionSets.assign({
  permissionSet: permissionSet.key,
  subject: { type: 'user', id: userId },
});
```

Prefer the authorization settings UI for administrator-managed assignments.
Use the API from migrations or controlled provisioning flows where a fixed
business configuration is required.

## Add a non-database resource

For a module operation that is not a database collection, register a resource
handler. The handler receives the request context and the grant service; it
should return a permit, deny, or conditional decision.

```ts
authz.resources.add({
  resourceType: 'files.download',
  async authorize(request, context) {
    const grants = await context.grants.resolve({
      principal: request.principal,
      subjects: request.subjects,
      resource: request.resource,
      action: request.action,
    });
    return grants.length > 0
      ? { effect: 'permit', reasons: [] }
      : { effect: 'deny', reasons: [] };
  },
});
```

The module can expose its own API, for example `files.download()`, while the
route or service performs the authorization request before invoking it.

## Review and diagnose

When a permission does not behave as expected, inspect in this order:

1. Confirm the resource type and id exactly match the resource, that the
   collection a `database.collection` id names is registered in
   `authz.db.collections`, and that db holds it.
2. Confirm the action is one the resource supports.
3. Confirm the request principal and subjects were resolved by middleware.
4. Check the user's Permission Set assignments.
5. Check Default Access, Sharing Rules, and Restriction Rules for that action.
6. Call `authz.explain()` with the same resource, action, and params used by
   the module. The returned reasons identify the authorization decision and
   its contributing constraints.

Do not treat a successful permission snapshot as proof that a database query
is safe: a snapshot contains grants, while database authorization may still
narrow the rows and fields a Policy allows.

## Implementation checklist

- Register the resource or collection in the module setup; an unregistered
  collection has no permission at all.
- Keep the module's service/repository API unchanged.
- Run authorization middleware before route guards.
- Use `policyFor()` and `withPolicy()` for collection reads and writes.
- Never re-implement a record filter or a field allowlist outside the Policy.
- Add a Permission Set only when the business access is reusable or needs
  administrator configuration.
- Test both an allowed request and a request denied by a record or field rule.
