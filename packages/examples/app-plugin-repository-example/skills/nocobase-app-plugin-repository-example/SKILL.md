---
name: nocobase-app-plugin-repository-example
description: Use the NocoBase 3 Repository API example plugin to demonstrate CRM and order CRUD, relation reads and writes, optimistic locking, atomic numeric updates, and aggregate queries.
---

# Repository example

This plugin owns six isolated example collections and five authenticated list pages and two API example pages in three sidebar groups, each with a detail child route. Use it when explaining or trying the Repository HTTP adapter. Do not use it as a production CRM or modify its tables to store unrelated application data.

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
- Atomic update page: `/repository-example/atomic`, in the Repository examples group. It uses `repositoryExampleAtomicCounters`, initialized by a separate migration and seed with stock, wallet, points and visits records. It demonstrates increment, guarded decrement, multiply and ten concurrent increments. Mutations use numeric operation objects; never read and send an absolute replacement value. Concurrent requests commit independently, and failed requests are not automatically retried.
- Aggregate page: `/repository-example/aggregate`, in the Repository examples group. It reuses existing seeds and shows item COUNT/SUM/AVG/MIN/MAX, status-filtered order counts, product `groupBy` with HAVING and sorting, and customer relation counts (first 50 customers, including zero). The status filter affects every panel; minimum quantity affects only grouped products. It calls the authenticated fixed `GET /api/repository-example/aggregate` endpoint via `api.request`, because the generic HTTP adapter does not expose aggregate/groupBy. The server delegates to database Repository methods. Enum status cannot be grouped by the current Repository, so status counts use filtered `aggregate`. Prices are cents; AVG is unweighted; empty-set sums and price metrics are NULL; separate panel queries are not a single snapshot.
- Actions: `findMany`, `findOne`, `count`, `exists`, `createOne`, `updateOne`, `deleteOne`, through the injected API client's `repository(name)`.

Create customers and products first, then contacts and orders. The new-order drawer supports item rows with product selection, default product prices, editable quantity/prices, and totals. Submit the order and `items.create` rows through one atomic `createOne` request. Detail reads include `items.product` to display product name and SKU alongside snapshot prices. Use the separate Order items page to manage existing items. Relations support `connect: { id }`; detail reads use JSON select AST includes. Related records use singular/plural headings matching the relation cardinality and link to their detail pages. Customer cards display name, company and email. Prices are integer cents. The UI shows request/result examples in Repository calls.

Every signed-in user can manage all example records. The API has no per-role or tenant rules. A production adaptation must explicitly design its own authorization boundary. Orders use optimistic locking: preserve `version` when editing and send `ifVersion`, handling 409 by refreshing rather than overwriting. Deletes cascade contacts/items but refuse to remove customers with orders or products with items.

## Ownership and verification

The plugin owns its migration, components, routes and locale strings. An application reaches it through public package exports; do not import private source paths. The plugin seed inserts 4 customers, 5 contacts, 6 products, 4 orders and 8 order items with stable demo IDs, plus 4 numeric counter examples from a separate seed. Completed seeds are skipped; user edits and deletions remain intact. All inserts are transactional, and existing IDs are never overwritten. For schema changes create a new self-contained migration after the existing one has shipped.

Verify migration success, authenticated navigation, a customer/product/order/item lifecycle, relation details, and conflict handling. The plugin's `check` runs lint, formatting, typecheck, real database/HTTP/page tests and build. The README documents the complete API and schema.
