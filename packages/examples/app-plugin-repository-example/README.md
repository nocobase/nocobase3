# Repository API example

A working CRM and order management plugin demonstrating `defineRepositoryApiRoutes`, the injected API client's remote Repository, relationship selections and mutations, and optimistic locking.

## Open the example

This workspace registers the plugin in `@nocobase/app-template-default`.

```bash
pnpm --filter @nocobase/app-template-default migrate
pnpm --filter @nocobase/app-template-default seed
pnpm --filter @nocobase/app-template-default dev
```

Sign in and expand **CRM example** or **Orders example** in the sidebar. Each child menu opens its own page:

- **CRM example**: Customers (`/repository-example/crm`), Contacts (`/repository-example/crm/contacts`).
- **Orders example**: Orders (`/repository-example/orders`), Order items (`/repository-example/orders/items`), Products (`/repository-example/orders/products`).

View details opens the child route `<list-path>/details/:recordId`, for example `/repository-example/crm/details/demo-customer-1`. Detail URLs load records directly, support refresh, show related records, and provide a Back to list action. Relation headings use singular labels for belongsTo and plural labels for hasMany. Related records link to their detail pages; customer cards show name, company and email, and foreign-key fields display the related name. New and Edit open a right-side drawer with focus management and Escape/Cancel dismissal. Relation and status fields use shadcn Select, with full-width triggers and readable selected labels. Successful saves close the drawer and refresh the list or current detail; errors keep the drawer and entered values visible.

The active child expands its parent group. Each page has a stable URL, so refresh and browser history retain the selected entity.

Paths are relative to the application's mount point. For an application mounted at `/main`, the CRM URL is `/main/repository-example/crm`.

Create a customer in CRM and products in Orders → Products. When creating an order, add item rows directly in the drawer: select a product, enter quantity, and adjust the automatically populated price if needed. Rows can be removed before saving; subtotals and the order total update immediately. A single `createOne` request writes the order and `items.create` rows atomically. Order details show product names, SKUs, quantities, snapshot prices, subtotals and the total, with links to product and item details. The separate Order items page remains available to manage existing items. The seed adds 4 customers, 5 contacts, 6 products, 4 orders and 8 order items. It covers every customer/order status and multiple related records; the paid order demonstrates a discounted price snapshot. The tables are isolated from the application's real customers and orders.

The seed uses fixed `demo-*` IDs, `DEMO-*` SKUs and `DEMO-SO-*` order numbers. The seed runner records completion and skips subsequent runs, so edits and deletions remain intact. If the seed is deliberately replayed without its history, it only inserts missing IDs and preserves existing records. Unique SKU/order-number collisions with another ID fail the entire transaction without leaving partial example data.

## Schema and relationships

| Logical collection / API name | Fields                                                     | Relationships                          |
| ----------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `repositoryExampleCustomers`  | `id`, `name`, `company`, `email`, `status`                 | hasMany `contacts`, hasMany `orders`   |
| `repositoryExampleContacts`   | `id`, `name`, `email`, `phone`, `customerId`               | belongsTo `customer`                   |
| `repositoryExampleProducts`   | `id`, `name`, unique `sku`, `unitPriceCents`               | hasMany `items`                        |
| `repositoryExampleOrders`     | `id`, unique `number`, `status`, `customerId`, `version`   | belongsTo `customer`, hasMany `items`  |
| `repositoryExampleOrderItems` | `id`, `orderId`, `productId`, `quantity`, `unitPriceCents` | belongsTo `order`, belongsTo `product` |

The browser generates UUID IDs for new records; seeded examples use stable `demo-*` IDs. Monetary values use integer cents; each item stores its own unit price snapshot, so later product price changes do not rewrite existing orders. The displayed line total is quantity × unit price. Customer statuses are `lead`, `active`, `inactive`; order statuses are `draft`, `confirmed`, `paid`, `cancelled`.

The self-contained migration creates the tables, unique constraints, relationship metadata and foreign keys. The belongsTo side owns each physical foreign key and its supporting index; the inverse hasMany side uses `constraints(false)` to avoid duplicating them. Deleting a customer cascades its contacts; deleting an order cascades its items. Customers referenced by orders and products referenced by items cannot be deleted. Rollback drops the tables in reverse dependency order.

## Repository HTTP API

`server/routes/index.ts` explicitly exposes these actions for the five CRM/order repositories and the atomic counter repository. Each request is JSON over `POST /api/<repository>:<action>` (with any application mount prefix).

| Action      | Visible example                                                         |
| ----------- | ----------------------------------------------------------------------- |
| `findMany`  | Table, text filter AST, sort AST, offset/limit pagination               |
| `findOne`   | View details / open editor, including related records with a select AST |
| `count`     | Filtered result count and pagination                                    |
| `exists`    | Look up by ID                                                           |
| `createOne` | New record, relationship `connect`                                      |
| `updateOne` | Edit record; orders send `ifVersion`                                    |
| `deleteOne` | Explicit deletion confirmation; orders send `ifVersion`                 |

Expand **Repository calls** to inspect the last seven request/result pairs. These are observational examples of the real API calls, not a second implementation of CRUD.

```ts
import { apiClientToken } from '@nocobase/app-client';

const api = app.services.resolve(apiClientToken);
const orders = api.repository('repositoryExampleOrders');
const created = await orders.createOne({
  values: {
    id: crypto.randomUUID(),
    number: 'SO-001',
    status: 'draft',
    customer: { connect: { id: customerId } },
  },
});
await orders.updateOne({
  filter: { id: created.record.id },
  values: { status: 'confirmed' },
  ifVersion: created.version,
});
```

See `client/model.ts` for the JSON select/filter ASTs and relationship mutation values. `client/pages/repository-page.tsx` drives the same seven actions for each entity. There are no handwritten CRUD HTTP handlers.

## Atomic numeric updates

Open **Repository examples → Atomic numeric updates** at `/repository-example/atomic`. A separate migration creates `repositoryExampleAtomicCounters` (`id`, `name`, non-null integer `value`). A separate transactional seed inserts four stable records without overwriting existing IDs:

| Record        | Initial value | Example                                  |
| ------------- | ------------: | ---------------------------------------- |
| `demo-stock`  |           120 | Receive units; guarded stock deduction   |
| `demo-wallet` |         50000 | Top up or spend integer cents            |
| `demo-points` |           100 | Add points; multiply by two              |
| `demo-visits` |             0 | One increment; ten concurrent increments |

Apply application migrations and seeds after updating the plugin. An empty page explains this prerequisite and disables mutation controls until its records exist. Completed seeds are skipped, preserving edits.

The authenticated `defineRepositoryApiRoutes` declaration exposes this collection too. The page sends `updateOne` with `values: { value: { increment: amount } }`, `decrement`, or `multiply: 2`. It never calculates an absolute replacement value from a browser read. Guarded deductions include `value >= amount` in the same update filter as the ID; no match returns 404 and changes nothing. This protects these page actions, while the shared example API remains a general Repository demonstration.

The concurrency action sends ten independent increments and reports every result with `Promise.allSettled`. Each successful request commits independently; there is no automatic retry. The page reloads the database value even when some requests fail. Other signed-in users share these counters, so the displayed total can also include their updates. Operands are positive integers up to 1,000,000; balance values are cents.

Tests verify authentication, integer validation, concurrent increments without lost updates, competing deductions from the last unit, seed replay, and page operations through real HTTP and SQLite.

## Aggregate queries

Open **Repository examples → Aggregate queries** at `/repository-example/aggregate`. The page reuses the seeded orders, items, products and customers; no additional migration or seed is required.

- `aggregate`: item row count, summed quantity, average/minimum/maximum unit price in cents.
- Filtered `aggregate`: order counts for each status. The status field is an enum, which the current Repository cannot use as a `groupBy` field.
- `groupBy`: items grouped by `productId`, with row count, summed quantity and average unit price, sorted by quantity descending. Product names, SKUs and detail links accompany each group.
- `having`: a minimum grouped quantity applies after aggregation, without changing the overall statistics.
- Relation aggregate selection: the first 50 customers by ID with their matching order count, including zero counts and customer detail links.

The status Select filters every panel, including items through `order.status`. Apply runs the query again; Repository calls shows the actual request and response. Empty sets return count 0 and NULL for SUM/AVG/MIN/MAX. Average price is the unweighted average of item unit prices, not revenue or a quantity-weighted average. Queries run separately, so concurrent edits may be observed between panels.

The plugin owns an authenticated `GET /api/repository-example/aggregate?status=all&minimumQuantity=0` endpoint declared through `defineApiRoutes`. The injected client calls it with `api.request`. It exposes only fixed collections and aggregates, validates the status and integer HAVING threshold (0–1,000,000), and delegates to database Repository methods. The generic `defineRepositoryApiRoutes` HTTP adapter currently supports the seven CRUD actions but does not expose `aggregate` or `groupBy`.

The main server calls are in `server/routes/aggregate.ts`:

```ts
const summary = await items.aggregate({
  filter: (f) => f.string('order.status').eq('paid'),
  aggregate: (a) => ({
    count: a.count(),
    quantity: a.sum('quantity'),
    averagePrice: a.avg('unitPriceCents'),
    minimumPrice: a.min('unitPriceCents'),
    maximumPrice: a.max('unitPriceCents'),
  }),
});
const groups = await items.groupBy({
  by: ['productId'],
  aggregate: (a) => ({ quantity: a.sum('quantity') }),
  having: (f) => f.number('quantity').gte(3),
  sort: (s) => s.field('quantity').desc(),
});
const customerCounts = await customers.findMany({
  limit: 50,
  select: (s) => s.fields('id', 'name').include('orders', (r) => r.count()),
});
```

Unmodified seed data yields 8 item rows, quantity 14, average price 14900 cents, minimum 5900 and maximum 32900. Selecting Paid yields 3 item rows and quantity 5; a grouped minimum of 2 retains Keyboard and Mouse. Tests verify these results through real HTTP/SQLite and page interactions, along with authentication, invalid input, empty sets, and failure recovery.

## Access and limits

Every exposed endpoint installs the authentication plugin's `required()` middleware. This is an intentionally shared example workspace: **every signed-in user can read and modify all example records**. There is no tenant isolation or per-role authorization in this example. Client pages independently require sign-in. Middleware applies only to the declared endpoints and does not protect or interfere with unrelated routes.

`defineRepositoryApiRoutes` enforces its standard JSON validation and 1 MiB request limit. Lists allow at most 100 records per request; the table uses 10. Relationship selectors fetch subsequent pages instead of silently hiding records after the first 100. Unknown collections and actions are not exposed. Concurrent order edits return `409 VERSION_CONFLICT` and the page asks the user to reload; it never silently retries and overwrites another update.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-repository-example check
```

Tests run a real SQLite migration and rollback, inspect physical schema and relationship metadata, invoke all seven actions through the HTTP client, verify all authentication boundaries, relation constraints and version conflicts, and exercise browser forms against the same real HTTP/SQLite fixture. Authentication sessions are stubbed in those fixtures; the real authentication middleware is executed.

The plugin uses shared development presets and plugin-local shadcn primitives. Its styles use the host's theme tokens and are included by the Default Template's enabled-plugin Tailwind scan.
