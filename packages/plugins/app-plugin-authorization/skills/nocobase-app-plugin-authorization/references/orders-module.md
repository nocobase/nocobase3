# Complete Orders authorization example

This example shows the boundary between a business module and Authorization.
The module owns the `orders` table, service, and HTTP routes. Authorization
decides what this request may do and hands back a Repository Policy; the
Repository enforces it.

## 1. Create the table

The migration belongs to the module that owns Orders, not to the authorization
package:

```ts
import { defineMigration, type MigrationDefinition } from '@nocobase/db';

export default defineMigration({
  name: 'orders_create_orders',
  async up({ builder }) {
    await builder.createCollection('orders', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('number', { length: 64 }).notNull();
      collection.string('customerName', { length: 255 }).notNull();
      collection.decimal('amount').notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('region', { length: 32 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_orders' });
      collection.unique('number', { name: 'uq_orders_number' });
      collection.index('ownerId', { name: 'idx_orders_owner' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('orders');
  },
} satisfies MigrationDefinition);
```

Authorization reads the field list, the primary key, and whether the database
generates it from `connection.collections`. What it does not read from db is
whether the collection may be granted on at all — that is the module's own
statement:

```ts
authz
  .getResource('database.collection')
  .items.add({ name: 'orders', title: 'Orders' });
```

Until that line runs, every request for `orders` is denied with
`COLLECTION_NOT_REGISTERED`, an unrestricted identity included. Exposing the
collection through `authz.db.repositories()` does not stand in for it: the
`add` is what carries the title the permission UI shows, so a module that only
exposes rows still writes it — from the service provider that owns the module,
at boot, rather than from the route file.

## 2. Know what the resource is called

A `database.collection` resource is identified by the registered collection
name — `orders`, with no connection prefix — and the actions are the fixed
`read`, `create`, `update` and `delete`.

```ts
const ordersResource = {
  type: 'database.collection',
  id: 'orders',
} as const;
```

`recordsIOwn` compares `params.field`, defaulting to `ownerId`, and
`recordsICreated` defaults to `createdById`. A module whose columns are named
differently passes the column in the grant rather than writing another copy of
the policy:

```ts
recordAccess: [{ key: 'recordsIOwn', params: { field: 'salesRepId' } }];
```

## 3. Bind the Policy to a Repository

`policyFor()` authorizes read, create, update and delete for this request —
the four calls share the request scope's caches — and folds the decisions into
one `RepositoryPolicy`. A denied action is `false`, an unconditional one is
`true`, and a conditional one is `{ scope, fields }`.

```ts
import { databaseManagerToken } from '@nocobase/db';

const database = app.container.resolve(databaseManagerToken);

routes.use('*', authz.middleware());

const repositoryFor = async (context: Context) =>
  database
    .repository('orders')
    .withPolicy(await authz.db.policyFor('orders', context.get('authz')));
```

The bound Repository applies the scope to every statement and rejects a field
outside the allowlist, so the service is ordinary Repository code:

```ts
routes.get('/orders', async (context) => {
  const orders = await repositoryFor(context);
  return context.json({
    data: await orders.findMany({ sort: (s) => s.field('createdAt').desc() }),
  });
});

routes.post('/orders', async (context) => {
  const orders = await repositoryFor(context);
  const { record } = await orders.createOne({
    values: parseOrderInput(await context.req.json()),
  });
  return context.json({ data: { id: record.id } }, 201);
});

routes.patch('/orders/:id', async (context) => {
  const orders = await repositoryFor(context);
  await orders.updateOne({
    filter: { id: context.req.param('id') },
    values: parseOrderInput(await context.req.json()),
  });
  return context.json({ data: { updated: 1 } });
});
```

Inspect the Policy when the route needs its own status code — `policy.read ===
false` is a 403 — and let a `RECORD_NOT_FOUND` error from `updateOne` or
`deleteOne` become a 404: a row outside the scope is indistinguishable from a
row that does not exist, which is the point.

A write grant must name every column the route stores, including the
timestamps the server stamps itself. `fields: { input: '*' }` expands to the
collection's columns minus a primary key the database generates, so it is safe
for a create; list the columns when the route should write fewer.

### Or expose the Repository directly

When the module has no handler of its own, `authz.db.repositories()` authorizes
`defineRepositoryApiRoutes()` endpoints in place. Each exposure names the
`resource` its rows belong to and declares the static Policy shape it offers;
the middleware narrows that shape with the caller's grants, and registers each
named collection at definition time.

```ts
const authorize = authz.db.repositories([
  {
    name: 'orders',
    resource: 'orders',
    policy: {
      read: { scope: true, fields: ['id', 'number', 'amount', 'ownerId'] },
      create: { scope: true, fields: ['number', 'amount', 'ownerId'] },
      update: { scope: true, fields: ['amount', 'status'] },
      delete: true,
    },
    actions: { findMany: {}, count: {}, createOne: {}, updateOne: {} },
  },
]);
for (const action of ['findMany', 'count', 'createOne', 'updateOne'])
  routes.use(`/orders:${action}`, auth.required(), authorize);
routes.route(
  '/',
  await defineRepositoryApiRoutes({
    principal: authorize.principal,
    repositories: authorize.repositories,
  }).createRouter(app),
);
```

`@nocobase/app-plugin-authorization-example` is this section built for real,
small enough to read end to end.

Mount it on every action: one it did not run on resolves no principal, and
app-server answers `403 PRINCIPAL_REQUIRED` rather than falling back to the
shape. Relation rules come from the shape, because a grant carries no relation
model and a member the grant does not mention stays as it was — so write
`read` out as a node rather than `true` when relations must stay readable.

## 4. Grant actions in a Permission Set

The shape a route exposes is what is possible; a Permission Set grants it to
subjects.
Configure each action separately, because create, read, update and delete
usually have different fields and record scopes.

```ts
const ordersManager = await authz.permissionSets.create({
  key: 'orders-manager',
  title: 'Orders manager',
  grants: [
    authz.db.grant('orders', {
      read: {
        fields: { output: '*' },
        recordAccess: ['allRecords'],
      },
      create: {
        fields: {
          input: [
            'number',
            'customerName',
            'amount',
            'status',
            'region',
            'ownerId',
            'createdById',
            'createdAt',
            'updatedAt',
          ],
        },
      },
      update: {
        fields: { input: ['status', 'amount', 'updatedAt'] },
        recordAccess: ['allRecords'],
      },
      delete: { recordAccess: ['allRecords'] },
    }),
  ],
});

await authz.permissionSets.assign({
  permissionSet: ordersManager.key,
  subject: { type: 'role', id: 'sales-manager' },
});
```

A subject assignment takes effect only when trusted request middleware adds
that verified subject to the current identity. Never accept subject ids from
request input.

## 5. Configure the record ranges

Permission Sets, Default Access, Sharing Rules and Restriction Rules all
operate on the same `database.collection` resource and never replace the action
grant: a user with no `read` grant cannot be given one by a Sharing Rule.

```ts
await authz.defaultAccess.set({
  resource: ordersResource,
  actions: [{ action: 'read', scope: authz.db.scope('allRecords') }],
});

await authz.sharingRules.create({
  key: 'share-key-accounts',
  resource: ordersResource,
  actions: [
    {
      action: 'read',
      selection: { type: 'records', ids: ['order-1', 'order-2'] },
    },
  ],
  subjects: [{ type: 'role', id: 'account-manager' }],
});

await authz.restrictionRules.create({
  key: 'contractors-own-orders',
  resource: ordersResource,
  actions: [
    { action: 'read', scope: authz.db.scope('recordsIOwn') },
    { action: 'update', scope: authz.db.scope('recordsIOwn') },
  ],
  subjects: [{ type: 'role', id: 'contractor' }],
});
```

The effective record range is:

```text
(Permission Set record policy OR Default Access OR Sharing Rule scopes)
  AND Restriction Rule scopes
```

The database plugin performs that combination and emits one filter AST. Do not
implement it again in Orders. An empty positive side denies the action; an
empty restriction side leaves the scope open.

A dynamic scope uses a registered Record Access policy, whose `resolve` returns
`true`, `false`, or a literal filter node:

```ts
import { condition } from '@nocobase/app-plugin-authorization/server';

authz.db.recordAccess.add<{ region: string }>({
  key: 'regionalOrders',
  resolve: ({ params }) => condition('region', '$eq', params.region),
});
```

Nodes are built literally rather than through db's `FilterBuilder`, which needs
a field's type to choose an operator group; a registration records names only.

## 6. Diagnose a denied request

```ts
const decision = await authz
  .for({
    principal: { type: 'user', id: 'user-alice' },
    subjects: [{ type: 'role', id: 'contractor' }],
  })
  .explain({
    resource: ordersResource,
    action: 'update',
    params: { fields: { input: ['amount'] } },
  });

console.log(decision.effect, decision.reasons, decision.conditions);
```

Check the resource id, action registration, subjects, Permission Set grant,
Default Access, Sharing Rules and Restriction Rules in that order.

## 7. Test the integration boundary

Assert the Policy `policyFor()` produces, and assert what the bound Repository
does with it — a route test that only checks a status code does not prove
row-level safety.

```ts
it('folds the request into a Repository Policy', async () => {
  await expect(authz.db.policyFor('orders', scope)).resolves.toMatchObject({
    read: { scope: true },
    update: { fields: ['status', 'amount', 'updatedAt'] },
    delete: false,
  });
});

it('cannot update a record outside the authorized scope', async () => {
  await expect(
    orders.updateOne({ filter: { id: 'bob-order' }, values: { status: 'x' } }),
  ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
});
```
