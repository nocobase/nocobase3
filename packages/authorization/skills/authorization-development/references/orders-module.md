# Complete Orders authorization example

This example shows the boundary between a business module and Authorization.
The module owns the `orders` table, service, and HTTP routes. Authorization
only decides whether the operation is allowed and returns the field and record
conditions that the service must apply.

## 1. Create the table

The migration belongs to the module that owns Orders, not to the authorization
package:

```ts
import {
  defineMigration,
  type MigrationDefinition,
} from '@nocobase/app-database';

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
      collection.index('createdById', { name: 'idx_orders_creator' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('orders');
  },
} satisfies MigrationDefinition);
```

Run this migration before configuring database permissions. The authorization
registry describes the fields that the module exposes; it does not create the
table.

## 2. Register the collection

During application authorization setup, the Orders module registers its own
resource. `orders` resolves to `main.orders` when the database plugin uses its
default source.

```ts
authz.database.collections.add({
  name: 'orders',
  title: 'Orders',
  actions: ['read', 'create', 'update', 'delete'],
  fields: [
    'id',
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
  attributes: {
    identifier: 'id',
    owner: 'ownerId',
    creator: 'createdById',
  },
});
```

The attributes are used by built-in record policies. `recordsIOwn` reads
`ownerId`; `recordsICreated` reads `createdById`. If a module uses different
field names, register those mappings instead of implementing another copy of
the policy.

## 3. Create the service

The service keeps the normal business API. It receives authorization
conditions as an additional internal argument and applies them to the query.

```ts
import type {
  DatabaseAuthorizationConditions,
  DatabaseFilter,
  DatabaseFilterOperator,
} from '@nocobase/authorization/database';
import type {
  ComparisonOperator,
  DatabaseManager,
  Expression,
  ExpressionBuilder,
  Row,
  SqlBool,
} from '@nocobase/app-database';

interface OrderInput extends Row {
  number?: string;
  customerName?: string;
  amount?: number;
  status?: string;
  region?: string;
  ownerId?: string;
}

export class OrdersService {
  constructor(private readonly database: DatabaseManager) {}

  list(
    fields: readonly string[],
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row[]> {
    return this.database
      .query()
      .selectFrom('orders')
      .select(fields)
      .where((eb) => compileFilter(eb, conditions.filter))
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async create(
    input: OrderInput,
    principalId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ id: string }> {
    assertInputFields(input, conditions.fields.input);
    const id = crypto.randomUUID();
    const now = new Date();
    await this.database
      .query()
      .insertInto('orders')
      .values({
        ...input,
        id,
        ownerId: input.ownerId ?? principalId,
        createdById: principalId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return { id };
  }

  async update(
    id: string,
    input: OrderInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    assertInputFields(input, conditions.fields.input);
    const result = await this.database
      .query()
      .updateTable('orders')
      .set({ ...input, updatedAt: new Date() })
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return result.updatedCount ?? 0;
  }

  async delete(
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.database
      .query()
      .deleteFrom('orders')
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return result.deletedCount ?? 0;
  }
}

const filterOperators: Readonly<
  Record<DatabaseFilterOperator, ComparisonOperator>
> = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $notIn: 'not in',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

function compileFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  const expressions = Object.entries(filter).map(([field, value]) => {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(value))
        throw new TypeError(`${field} must be an array`);
      const nested = value.map((item) => compileFilter(eb, item));
      return field === '$and' ? eb.and(nested) : eb.or(nested);
    }
    if (!value || Array.isArray(value)) {
      throw new TypeError(`Invalid filter for ${field}`);
    }
    return eb.and(
      Object.entries(value).map(([operator, expected]) => {
        const comparison = filterOperators[operator as DatabaseFilterOperator];
        if (!comparison)
          throw new TypeError(`Unknown filter operator: ${operator}`);
        return eb(field, comparison, expected);
      }),
    );
  });
  return eb.and(expressions);
}

function assertInputFields(
  input: OrderInput,
  allowed: '*' | readonly string[],
): void {
  if (allowed === '*') return;
  const rejected = Object.keys(input).filter(
    (field) => !allowed.includes(field),
  );
  if (rejected.length > 0) {
    throw new TypeError(
      `Input fields are not authorized: ${rejected.join(', ')}`,
    );
  }
}
```

`compileFilter` is the module query adapter. Authorization validates the Filter
AST against the registered fields; this adapter translates `$and`, `$or`,
`$eq`, `$ne`, `$in`, `$notIn`, `$gt`, `$gte`, `$lt`, and `$lte` into the query
builder. Keep this translation in one adapter instead of scattering
comparisons through the service. On `update` and `delete`, the record id and
authorization filter must be in the same database statement.

The service must also reject fields outside `conditions.fields.input` before a
write and select only `conditions.fields.output` for a read. A permit decision
does not mean every field or record is available.

## 4. Protect CRUD routes

The route resolves the request identity through `authz.middleware()`, asks the
database authorizer for conditions, and then calls the module service.

```ts
const ordersResource = {
  type: 'database.collection',
  id: 'main.orders',
} as const;

routes.use('*', authz.middleware());

function requireDatabaseConditions(
  decision: AuthorizationDecision,
): DatabaseAuthorizationConditions {
  if (
    decision.effect !== 'conditional' ||
    decision.conditions?.type !== 'database'
  ) {
    throw new AuthorizationDeniedError(decision);
  }
  return decision.conditions as DatabaseAuthorizationConditions;
}

routes.get('/orders', async (context) => {
  const requested = ['id', 'number', 'customerName', 'amount', 'status'];
  const decision = await context.get('authz').authorize({
    resource: ordersResource,
    action: 'read',
    params: { fields: { output: requested } },
  });
  const conditions = requireDatabaseConditions(decision);
  return context.json({
    data: await orders.list(requested, conditions),
  });
});

routes.post('/orders', async (context) => {
  const input = parseOrderInput(await context.req.json());
  const decision = await context.get('authz').authorize({
    resource: ordersResource,
    action: 'create',
    params: { fields: { input: Object.keys(input), output: ['id'] } },
  });
  const conditions = requireDatabaseConditions(decision);
  return context.json(
    {
      data: await orders.create(
        input,
        context.get('authz').identity.principal.id,
        conditions,
      ),
    },
    201,
  );
});

routes.patch('/orders/:id', async (context) => {
  const input = parseOrderInput(await context.req.json());
  const decision = await context.get('authz').authorize({
    resource: ordersResource,
    action: 'update',
    params: { fields: { input: Object.keys(input) } },
  });
  const conditions = requireDatabaseConditions(decision);
  const updated = await orders.update(
    context.req.param('id'),
    input,
    conditions,
  );
  return updated === 0
    ? context.json({ error: 'Order not found.' }, 404)
    : context.json({ data: { updated } });
});

routes.delete('/orders/:id', async (context) => {
  const decision = await context.get('authz').authorize({
    resource: ordersResource,
    action: 'delete',
    params: { fields: {} },
  });
  const conditions = requireDatabaseConditions(decision);
  const deleted = await orders.delete(context.req.param('id'), conditions);
  return deleted === 0
    ? context.json({ error: 'Order not found.' }, 404)
    : context.json({ data: { deleted } });
});
```

`requireDatabaseConditions()` should convert `deny` and unsupported decision
shapes to a 403 and return the typed database conditions for a conditional
decision. For a module with a simple non-database action, use `authz.guard()`
instead; database CRUD needs `authorize()` because the result carries fields
and record filters.

## 5. Grant actions in a Permission Set

The module registers what is possible; a Permission Set grants it to subjects.
Configure each action separately because create, read, update, and delete
usually have different fields and record scopes.

```ts
const ordersManager = await authz.permissionSets.create({
  key: 'orders-manager',
  title: 'Orders manager',
  grants: [
    authz.database.grant('orders', {
      read: {
        fields: {
          output: [
            'id',
            'number',
            'customerName',
            'amount',
            'status',
            'region',
          ],
        },
        recordAccess: ['allRecords'],
      },
      create: {
        fields: {
          input: ['number', 'customerName', 'amount', 'status', 'region'],
          output: ['id'],
        },
      },
      update: {
        fields: {
          input: ['status', 'amount'],
          output: ['id', 'status', 'amount'],
        },
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

A subject assignment is effective only when trusted request middleware adds
that verified subject to the current identity. For example, assigning a set to
`{ type: 'role', id: 'sales-manager' }` requires the role integration to add
the same active role to `identity.subjects`. Never accept subject ids directly
from unverified request input.

The same configuration can be created in the authorization settings UI. Code
is appropriate for a fixed baseline or a migration; administrator-managed
assignments should normally use the UI or its settings API.

## 6. Configure the four database access ranges

All four features operate on the same `database.collection` resource, but they
have different jobs. They never replace the action grant.

### Permission Set: who may perform an action

The Permission Set supplies the action grant and may include field and record
policy. If the user has no `read` grant, a Default Access or Sharing Rule
cannot make the user read Orders.

### Default Access: resource-wide baseline

Use it when a granted action should start with a shared baseline, such as all
orders visible to users who have the read grant:

```ts
await authz.defaultAccess.set({
  resource: ordersResource,
  actions: [
    { action: 'read', scope: authz.database.scope('allRecords') },
    { action: 'update', scope: authz.database.scope('recordsIOwn') },
  ],
});
```

Default Access is resource-wide. It has no subject assignment table.

### Sharing Rule: expand access for selected subjects

Use it when a user, role, or department needs additional records beyond the
baseline. Explicit records are stored per rule and per action:

```ts
await authz.sharingRules.create({
  key: 'share-key-accounts',
  title: 'Key accounts for account managers',
  resource: ordersResource,
  actions: [
    {
      action: 'read',
      selection: { type: 'records', ids: ['order-1', 'order-2'] },
    },
  ],
  subjects: [{ type: 'role', id: 'account-manager' }],
});
```

The recipient still needs the corresponding action grant. Sharing an order
with a user who has no Orders `read` grant does not create that grant.

For a dynamic scope, use a registered policy rather than putting IDs into a
policy value:

```ts
await authz.sharingRules.create({
  key: 'share-north-region',
  resource: ordersResource,
  actions: [
    {
      action: 'read',
      selection: {
        type: 'policy',
        policy: authz.database.scope({
          key: 'customFilter',
          params: { filter: { $and: [{ region: { $eq: 'north' } }] } },
        }),
      },
    },
  ],
  subjects: [{ type: 'department', id: 'north-sales' }],
});
```

### Restriction Rule: narrow access for selected subjects

Use it for a mandatory upper bound. It cannot grant an action by itself:

```ts
await authz.restrictionRules.create({
  key: 'contractors-own-orders',
  title: 'Contractors can only access their own orders',
  resource: ordersResource,
  actions: [
    { action: 'read', scope: authz.database.scope('recordsIOwn') },
    { action: 'update', scope: authz.database.scope('recordsIOwn') },
    { action: 'delete', scope: authz.database.scope('recordsIOwn') },
  ],
  subjects: [{ type: 'role', id: 'contractor' }],
});
```

The effective record range is conceptually:

```text
(Permission Set record policy OR Default Access OR Sharing Rule scopes)
  AND Restriction Rule scopes
```

The database authorizer combines these constraints and returns one Filter AST
to the module. Do not implement this boolean combination again in Orders.

## 7. Diagnose a denied request

Use the same request shape as the route and inspect `explain()`:

```ts
const decision = await authz
  .for({
    principal: { type: 'user', id: 'user-alice' },
    subjects: [
      { type: 'authenticated', id: '*' },
      { type: 'role', id: 'contractor' },
    ],
  })
  .explain({
    resource: ordersResource,
    action: 'update',
    params: { fields: { input: ['amount'] } },
  });

console.log(decision.effect, decision.reasons, decision.conditions);
```

Check the resource id, action registration, subjects, Permission Set grant,
Default Access, Sharing Rules, and Restriction Rules in that order. A
`conditional` decision is allowed only when the service applies its returned
fields and filter; a plain permission snapshot does not contain those query
conditions.

## 8. Test the integration boundary

Test the service with database conditions rather than only testing
`authorize()` in isolation. At minimum cover:

```ts
it('pushes the authorized record filter into list', async () => {
  const rows = await orders.list(
    ['id', 'number'],
    conditions('read', { $and: [{ ownerId: { $eq: 'alice' } }] }),
  );
  expect(rows).toEqual([{ id: 'alice-order', number: 'SO-001' }]);
});

it('cannot update a record outside the authorized filter', async () => {
  const updated = await orders.update(
    'bob-order',
    { status: 'cancelled' },
    conditions('update', { $and: [{ ownerId: { $eq: 'alice' } }] }),
  );
  expect(updated).toBe(0);
});

it('rejects an unauthorized input field', async () => {
  await expect(
    orders.update(
      'alice-order',
      { amount: 1000 },
      conditions('update', { $and: [] }, { input: ['status'], output: ['id'] }),
    ),
  ).rejects.toThrow('Input fields are not authorized: amount');
});

function conditions(
  action: string,
  filter: DatabaseAuthorizationConditions['filter'],
  fields: DatabaseAuthorizationConditions['fields'] = {
    input: '*',
    output: '*',
  },
): DatabaseAuthorizationConditions {
  return {
    type: 'database',
    collection: 'main.orders',
    action,
    filter,
    fields,
  };
}
```

Add route tests for a missing action grant (403), an unknown requested field
(403), and a matching rule that returns `conditional`. The important assertion
is that the service receives and applies `decision.conditions`; a route test
that only checks the response status does not prove row-level safety.
