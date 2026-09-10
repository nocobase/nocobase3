# Dialect test boundary

Each dialect package owns a `DatabaseDialectTestAdapter`. The adapter creates
one isolated context and is responsible for its connection, schema setup,
physical cleanup, and native driver options. Shared contracts consume only the
portable operations exposed by `DatabaseContractContext`.

The shared package must not import a concrete dialect or inspect a dialect
name. Catalog queries such as `PRAGMA`, `information_schema`, `user_*`, and
`sys.*` belong to the dialect package that owns the database.

Tests that exercise the `@nocobase/db` manager, AST, or lifecycle remain in the
core package. Tests that exercise SQL compilation, native types, or a native
driver belong to the matching dialect package. A contract may be run by many
dialect packages through their adapters.
