# Dialect test boundary

Each dialect package owns a `DatabaseDialectTestAdapter`. The adapter creates
one isolated context and is responsible for its connection, schema setup,
physical cleanup, and native driver options. Shared contracts consume only the
portable operations exposed by `DatabaseContractContext`.

The shared package must not import a concrete dialect or inspect a dialect
name. Catalog queries such as `PRAGMA`, `information_schema`, `user_*`, and
`sys.*` belong to the dialect package that owns the database.

The shared integration suite lives in this package under `tests/integration`.
It exercises the `@nocobase/db` manager, builder, repository, query, metadata,
migration, seed, and schema contracts without choosing a database. Each
dialect package loads the same suite through its own adapter, so adding a new
dialect does not require changing the core package or copying the suite.

Dialect-specific SQL, catalog inspection, native types, and driver behavior
remain in the matching `@nocobase/db-<dialect>` package. A shared contract may
be run by many dialect packages through their adapters.
