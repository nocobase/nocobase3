---
name: nocobase-app-plugin-repository-example
description: Use the NocoBase 3 Repository API example plugin to demonstrate array and streamed findMany queries, CRM and order CRUD, relation reads and writes, optimistic locking, atomic numeric updates, and aggregate queries.
---

# Repository example

This plugin owns thirteen isolated example collections, five authenticated list pages, and four API example pages in three sidebar groups, each CRUD entity having a detail child route. Use it when explaining or trying the Repository HTTP adapter. Do not use it as a production CRM or modify its tables to store unrelated application data.

## Prerequisites and registration

The application must register `@nocobase/app-plugin-authentication` and this plugin on the Server, and this plugin's Client factory. It needs the normal `apiClientToken` and a working database. Apply application migrations before opening the pages.

```bash
pnpm plugin:register repository-example --app app-template-default
pnpm --filter @nocobase/app-template-default migrate
pnpm --filter @nocobase/app-template-default seed
```

## Public surfaces

- Client factory: `@nocobase/app-plugin-repository-example/client`.
- Server definition: `@nocobase/app-plugin-repository-example/server`.
- CRM group: customers at `/repository-example/crm`, contacts at `/repository-example/crm/contacts`.
- Orders group: orders at `/repository-example/orders`, items at `/repository-example/orders/items`, products at `/repository-example/orders/products`. Paths are relative to the application mount point; each entity has its own URL.
- Detail routes append `/details/:recordId` to the list path. New and Edit use a right-side drawer; errors preserve input, and successful saves refresh the current page.
- Repositories: `repositoryExampleCustomers`, `repositoryExampleContacts`, `repositoryExampleProducts`, `repositoryExampleOrders`, `repositoryExampleOrderItems`.
- Relationship-write page: `/repository-example/relation-mutations`, in the Repository examples group. It uses six `repositoryExampleRelation*` collections so the example cannot collide with an App's real users, projects, tasks, tags or join tables. The seeded baseline covers belongsTo owner, hasOne profile, hasMany tasks, nested task assignee and belongsToMany tags with `role` through payload. **Run complete relationship write** uses new IDs for each run and calls only `api.repository(name)`: nested create/connect, incremental create/connect/disconnect/update/upsert/delete, and a separate tag set. The page shows the final select, through payloads and target lifetime checks. Each root HTTP mutation is transactional; the multi-request walkthrough as a whole is not one transaction.
- findMany page: `/repository-example/find-many`, in the Repository examples group. It queries `repositoryExampleFindManyRecords`, initialized with 24 deterministic records. The two panels execute identical sorted queries: `await repository.findMany(options)` requests JSON and returns an array, while `for await (const record of repository.findMany(options))` requests framed NDJSON and yields records as they arrive. Create a new query for each consumption mode; one query cannot mix modes.
- Atomic update page: `/repository-example/atomic`, in the Repository examples group. It uses `repositoryExampleAtomicCounters`, initialized by a separate migration and seed with stock, wallet, points and visits records. It demonstrates increment, guarded decrement, multiply and ten concurrent increments. Mutations use numeric operation objects; never read and send an absolute replacement value. Concurrent requests commit independently, and failed requests are not automatically retried.
- Aggregate page: `/repository-example/aggregate`, in the Repository examples group. It reuses existing seeds and shows item COUNT/SUM/AVG/MIN/MAX, status-filtered order counts, product `groupBy` with HAVING and sorting, and customer relation counts (first 50 customers, including zero). The status filter affects every panel; minimum quantity affects only grouped products. It calls `api.repository(name).aggregate()` and `.groupBy()` using JSON ASTs through authenticated `defineRepositoryApiRoutes` actions. The example-specific GET endpoint has been removed. The actual requests are in `client/aggregate.ts`, with product lookup batches of 100. Enum status counts use one `groupBy` query with exact member identity, including case and trailing spaces. Enum field sorting remains unsupported; the page uses aggregate sorting and explicit presentation order. Prices are cents; AVG is unweighted; empty-set sums and price metrics are NULL; separate panel queries are not a single snapshot.
- Additional groupBy panels on the Aggregate page: customer order ranking (`customerId`), customer × enum status (`customerId`, `status`), and product × snapshot price (`productId`, `unitPriceCents`). The status filter applies before grouping; a separate minimum row count applies HAVING to each group in these three panels. Existing minimum quantity affects only the original product summary. Show friendly names and detail links, plus each panel's actual AST and raw results. With seed data, minimum count 2 retains Ada in ranking and USB-C Dock in product/price while customer/status is empty. Implementation is in `client/group-by.ts`; no new schema or seeds are needed.
- Actions: `findMany`, `findOne`, `count`, `exists`, `createOne`, `updateOne`, `deleteOne`, `aggregate`, `groupBy`, through the injected API client's `repository(name)`.

Create customers and products first, then contacts and orders. The new-order drawer supports item rows with product selection, default product prices, editable quantity/prices, and totals. Submit the order and `items.create` rows through one atomic `createOne` request. Detail reads include `items.product` to display product name and SKU alongside snapshot prices. Use the separate Order items page to manage existing items. Relations support `connect: { id }`; detail reads use JSON select AST includes. Related records use singular/plural headings matching the relation cardinality and link to their detail pages. Customer cards display name, company and email. Prices are integer cents. The UI shows request/result examples in Repository calls.

Every signed-in user can manage all example records. The API has no per-role or tenant rules. A production adaptation must explicitly design its own authorization boundary. Orders use optimistic locking: preserve `version` when editing and send `ifVersion`, handling 409 by refreshing rather than overwriting. Deletes cascade contacts/items but refuse to remove customers with orders or products with items.

## Ownership and verification

The plugin owns its migrations, components, routes and locale strings. An application reaches it through public package exports; do not import private source paths. The plugin seed inserts 4 customers, 5 contacts, 6 products, 4 orders and 8 order items with stable demo IDs, plus 4 numeric counters, 24 findMany records and the prefixed relationship baseline from separate seeds. Completed seeds are skipped; user edits and deletions remain intact. All inserts are transactional, and existing identities are never overwritten. For schema changes create a new self-contained migration after the existing one has shipped.

Verify migration success, authenticated navigation, a customer/product/order/item lifecycle, relation details, and conflict handling. The plugin's `check` runs lint, formatting, typecheck, real database/HTTP/page tests and build. The README documents the complete API and schema.

Repository route actions use configuration objects (`findMany: { maxLimit: 100 }`,
`findOne: {}`). API create/update writes default to `writePolicy: false`. Each server
endpoint declares its own field and relation-operation allowlist, using objects or
synchronous callback builders. Nested task create/update/upsert branches have separate
field rules; task creation explicitly permits `assignee.connect`. Many-to-many tag
operations permit only the `role` through field. Prefer relation `connect` when the
endpoint exposes it; direct foreign-key fields are not implicitly writable. Keep
policies on the server and never include them in client request options. New demos
need an explicit server policy and route tests. Authentication guards every endpoint.
Internal `db.repository` calls default to `writePolicy: true`, so custom HTTP handlers
must pass a server-owned policy themselves.
