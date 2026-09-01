# Managed Collection Lifecycle

This example uses a temporary SQLite database to demonstrate the managed
`@nocobase/db` lifecycle:

```text
Migration
  -> physical Schema and Database-backed supplemental Metadata
  -> Seed
  -> connection.collections resolution
  -> Metadata compare-and-swap update
  -> Metadata transaction rollback
  -> database reopen and persistence check
  -> Migration rollback
```

Run it from the repository root:

```bash
pnpm --filter @nocobase/db example managed
```

The Migration owns the fixed historical Schema operations. The Seed inserts
only the required order-status records. Physical field facts come back from the
Schema Inspector, while titles, descriptions, and relations come from the
Database Collection Metadata Store.
