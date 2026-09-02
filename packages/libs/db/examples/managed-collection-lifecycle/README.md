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
```

Run it from the repository root:

```bash
pnpm --filter @nocobase/db example managed
```

The result is retained under `examples/tmp/`, and the command prints its
absolute SQLite filename. The retained database contains the migrated Schema,
supplemental Metadata, and Seed records. To verify Migration rollback and then
remove this run's result, use cleanup mode:

```bash
pnpm --filter @nocobase/db example managed --cleanup
```

The Migration owns the fixed historical Schema operations. The Seed inserts
only the required order-status records. Physical field facts come back from the
Schema Inspector, while titles, descriptions, and relations come from the
Database Collection Metadata Store.
