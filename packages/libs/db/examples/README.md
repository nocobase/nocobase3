# `@nocobase/db` Examples

The examples are executable documentation for complete public API workflows.
They create SQLite databases under `examples/tmp/` and remove each run's
temporary subdirectory when it finishes. The `tmp/` directory is ignored by
Git.

```bash
pnpm --filter @nocobase/db example list
pnpm --filter @nocobase/db example managed
pnpm --filter @nocobase/db example external
pnpm --filter @nocobase/db example all
```

Available examples:

- `managed`: Migration, Database Metadata Store, Seed, Collection resolution,
  Metadata compare-and-swap, transaction rollback, persistence, and Migration
  rollback.
- `external`: external physical Schema, Module Metadata Store, Collection
  resolution, record DML, and read-only Schema/Metadata boundaries.

Examples are not another source of runtime Collection truth. Migrations create
physical Schema, Metadata Stores provide supplemental application semantics,
and `connection.collections` resolves the two at runtime.
