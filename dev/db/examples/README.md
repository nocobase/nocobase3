# `@nocobase/db` Examples

The examples are executable documentation for complete public API workflows. They create SQLite databases under `examples/tmp/`, retain each result by default, and print the absolute SQLite filename so it can be inspected after the command finishes. The `tmp/` directory is ignored by Git.

```bash
pnpm db:example list
pnpm db:example managed
pnpm db:example external
pnpm db:example all

# Run an example and remove this run's result when it finishes.
pnpm db:example managed --cleanup
pnpm db:example all --cleanup

# Remove every retained example result.
pnpm db:example clean
```

Available examples:

- `managed`: Migration, Database Metadata Store, Seed, Collection resolution,
  Metadata compare-and-swap, transaction rollback, persistence, and Migration
  rollback in cleanup mode.
- `external`: external physical Schema, Module Metadata Store, Collection
  resolution, record DML, and read-only Schema/Metadata boundaries.

Examples are not another source of runtime Collection truth. Migrations create physical Schema, Metadata Stores provide supplemental application semantics, and `connection.collections` resolves the two at runtime.
