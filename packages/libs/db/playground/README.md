# `@nocobase/db` Commerce Playground

This playground is a small Hono commerce application built directly on the
public `@nocobase/db` API. It uses two retained SQLite databases:

- `main`: a managed commerce database created by Migration, supplemented by a
  writable Database Metadata Store, and populated by Seed.
- `crm`: an externally bootstrapped CRM Schema opened with
  `schemaManagement: external` and a read-only Module Metadata Store.

The Web UI provides a dashboard, product CRUD, order transactions, external
CRM customer/contact CRUD, and a Database Inspector that compares physical
Schema, Metadata, and the resolved runtime Collection.

## Run

From the repository root:

```bash
pnpm --filter @nocobase/db playground
```

Open <http://127.0.0.1:3100>. Both databases are retained under
`playground/tmp/` when the server stops.

```bash
# Recreate and seed both databases before starting.
pnpm --filter @nocobase/db playground --reset

# Use a different address.
pnpm --filter @nocobase/db playground --host 0.0.0.0 --port 3200

# Remove retained playground databases.
pnpm --filter @nocobase/db playground clean
```

## Database ownership

The main database demonstrates owned Schema evolution:

```text
Migration -> physical Schema + Database Metadata -> Seed -> Hono CRUD
```

The external CRM demonstrates integration with an existing database:

```text
External bootstrap -> physical Schema
                         +
                    Module Metadata
                         |
                         v
              connection.collections -> Hono CRUD
```

External Schema management rejects Builder and Migration DDL, but it does not
make CRM records read-only. Customer and contact CRUD continue to use the
external connection's QueryAdapter. Cross-database order creation reads the CRM
customer first, then performs order creation, item creation, stock validation,
and stock updates in one transaction on the managed connection. It does not
pretend that the two SQLite files share a distributed transaction.
