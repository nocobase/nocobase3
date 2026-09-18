# Database and data access

Schema changes are migrations — see [migrations and seeds](migrations.md). This page is about reading and writing data at runtime.

## Resolving the database

Resolve `databaseManagerToken` from the container:

```ts
import { databaseManagerToken } from '@nocobase/db';

const database = app.container.resolve(databaseManagerToken);
```

In a route factory, resolve it once in the factory rather than inside each handler. In a service, take it as a constructor dependency — see [services and jobs](services-and-jobs.md).

The manager exposes three things:

| Call                       | Returns                                          |
| -------------------------- | ------------------------------------------------ |
| `database.query()`         | Query builder for reading and writing rows       |
| `database.builder()`       | Schema builder; for migrations, not runtime code |
| `database.transaction(fn)` | Runs `fn` with a connection inside a transaction |

Each takes an optional connection name and uses the default connection when omitted.

## Reading

```ts
const query = database.query();

const orders = await query
  .selectFrom('orders')
  .selectAll()
  .where('status', '=', 'open')
  .orderBy('createdAt', 'desc')
  .limit(50)
  .execute();

const order = await query
  .selectFrom('orders')
  .selectAll()
  .where('id', '=', id)
  .executeTakeFirst();
```

`execute()` returns an array, `executeTakeFirst()` a row or `undefined`, and `executeTakeFirstOrThrow()` a row or throws. Also available: `value(column)` for a single value, `pluck(column)` for one column across rows, and `exists()`.

Values passed to `where` are parameterized. Never build SQL by interpolating a string.

Joins, `groupBy`, `having`, and aggregate functions through the expression builder are all available; read the `QueryAdapter` types in `@nocobase/db` for the full surface.

## Writing

```ts
await query
  .insertInto('orders')
  .values({ reference: 'ORD-1', createdAt: new Date() })
  .execute();

await query
  .updateTable('orders')
  .set({ status: 'closed' })
  .where('id', '=', id)
  .execute();

await query.deleteFrom('orders').where('id', '=', id).execute();
```

`update` and `delete` require a `where`. Affecting every row needs an explicit `allowAllRows()` — the guard exists because an accidentally omitted `where` is unrecoverable in production.

## Transactions

Group writes that must succeed or fail together:

```ts
await database.transaction(async (connection) => {
  await connection.query.insertInto('orders').values(order).execute();
  await connection.query
    .updateTable('inventory')
    .set({ reserved: true })
    .where('sku', '=', order.sku)
    .execute();
});
```

Use the `connection` the callback provides. A query issued through the outer `database.query()` inside the callback runs outside the transaction and will not roll back with it. Returning from the callback commits; throwing rolls back.

## Identifiers

Write the same camelCase names you used in the migration. A `createdAt` field is stored in a `created_at` column, and the adapter converts in both directions: `where('createdAt', ...)` targets the right column, and returned rows come back with `createdAt` keys.

Physical names work too, so `where('created_at', ...)` is equally valid — but stay consistent with the migration's camelCase so the code reads the same throughout.

The exception is anywhere a raw index or constraint name is needed, such as `dropIndex` in a migration. Those are generated names like `idx_orders_status` and are not converted.

## Where data access belongs

Put queries in a service and call the service from the route, once more than one handler needs the same data or the logic is worth testing on its own. A route that only reads and returns a list may query directly.

Never expose a raw row shape as an API response without deciding what belongs in it. Internal columns leak through `selectAll()`.

## Generated IDs

`IdGeneratorProvider` supplies Snowflake IDs when a table needs a sortable identifier not tied to auto-increment. `increments('id')` is fine for ordinary tables.

## Verify

- Queries return what you expect against a real database, not only in a mocked test.
- Updates and deletes are scoped by `where`.
- Multi-write operations roll back as a unit on failure.
- Responses expose intended fields only.
