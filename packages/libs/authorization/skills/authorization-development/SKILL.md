---
name: authorization-development
description: 'Develop and configure NocoBase authorization: register resources, protect application APIs, define database field and record policies, and diagnose the resulting permission behavior.'
metadata:
  short-description: Develop and configure NocoBase authorization
---

# Authorization development

Use this skill when a coding agent needs to add authorization to a NocoBase
module or configure business permissions for an installed module. The goal is
to keep business code calling its own API while authorization runs at the
boundary of that API.

For a complete end-to-end implementation, read
[references/orders-module.md](references/orders-module.md). It is a compact
Orders module example covering schema, service, routes, resource registration,
and all four database access-range features.

## Choose the right layer

- Use `authz.resources.add()` when a module owns a new resource type and needs
  to define how that resource is authorized.
- Use `authz.database.collections.add()` when a module exposes a database
  collection. Register its actions and fields so Permission Sets, Default
  Access, Sharing Rules, and Restriction Rules can configure it.
- Use `authz.guard()` for an HTTP route or action that needs one authorization
  check before the handler runs.
- Use `context.get('authz').authorize()` when the handler needs the resulting
  database conditions or field limits before building a query.
- Use Permission Sets and the authorization settings API/UI for business
  configuration. Do not hard-code end-user assignments in a feature route.

Do not add a second permission system inside a module. The module should keep
its normal service/repository API and add an authorization check immediately
before the operation.

## Register a database resource

Register the collection while creating the application authorization instance.
The `name` must match the resource id used by authorization requests. Actions
are the operations the module supports; fields are used by field-level policy
configuration.

```ts
const authz = createAuthorization({
  connection,
  plugins: [
    permissionSets(),
    databaseAuthorization(),
    defaultAccess(),
    sharingRules(),
    restrictionRules(),
  ],
});

authz.database.collections.add({
  name: 'orders',
  title: 'Orders',
  actions: ['read', 'create', 'update', 'delete'],
  fields: ['id', 'number', 'amount', 'status', 'ownerId'],
  attributes: {
    identifier: 'id',
    owner: 'ownerId',
  },
});
```

Keep this registration close to the module's resource setup. A collection that
is not registered cannot be selected by the authorization configuration UI and
will not be accepted by the database authorizer.

## Protect a module API

The module still calls its own service or repository. Authorization supplies
the constraints used by that service; it does not replace the service.

```ts
routes.get('/orders', async (context) => {
  const decision = await context.get('authz').authorize({
    resource: { type: 'database.collection', id: 'main.orders' },
    action: 'read',
    params: { fields: { output: ['id', 'number', 'amount'] } },
  });

  if (
    decision.effect !== 'conditional' ||
    decision.conditions?.type !== 'database'
  ) {
    return context.json({ code: 'FORBIDDEN' }, 403);
  }

  return context.json({
    data: await orders.list(decision.conditions),
  });
});
```

The registered collection belongs to the `main` source by default, so the
authorization resource id in this example is `main.orders`:

```ts
resource: { type: 'database.collection', id: 'main.orders' }
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
request principal and subjects from the authentication session and any other
installed identity middleware.

## Apply database conditions safely

For `read`, `create`, and `update`, pass the requested field sets and use the
returned database conditions when constructing the query. For `update` and
`delete`, put the returned record filter in the same SQL `WHERE` clause as the
record id. Never fetch a record first and apply the filter only in memory.

```ts
const decision = await authz.authorize({
  resource: { type: 'database.collection', id: 'main.orders' },
  action: 'update',
  params: { fields: { input: Object.keys(input) } },
});

if (
  decision.effect !== 'conditional' ||
  decision.conditions?.type !== 'database'
) {
  throw new AuthorizationDeniedError(decision);
}

await orders.update(id, input, decision.conditions);
```

The module's service is responsible for compiling the conditions into its
query builder and for rejecting fields outside `conditions.fields.input` or
`conditions.fields.output`.

## Configure business permissions

Permission configuration has two parts:

1. The module registers resources and supported actions in code.
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
    authz.database.grant('orders', {
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

1. Confirm the resource type and id exactly match the registered resource.
2. Confirm the action is registered for that resource.
3. Confirm the request principal and subjects were resolved by middleware.
4. Check the user's Permission Set assignments.
5. Check Default Access, Sharing Rules, and Restriction Rules for that action.
6. Call `authz.explain()` with the same resource, action, and params used by
   the module. The returned reasons identify the authorization decision and
   its contributing constraints.

Do not treat a successful permission snapshot as proof that a database query
is safe: a snapshot contains grants, while database authorization may still
return field and record conditions.

## Implementation checklist

- Register the resource or collection in the module setup.
- Keep the module's service/repository API unchanged.
- Run authorization middleware before route guards.
- Use `authorize()` when query conditions are needed.
- Apply record filters and field limits inside the database query path.
- Add a Permission Set only when the business access is reusable or needs
  administrator configuration.
- Test both an allowed request and a request denied by a record or field rule.
