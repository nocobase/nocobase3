# Integration Tests

These tests exercise database package behavior against real database
connections. They are intentionally organized under `tests/integration` by
public capability rather than by database backend because the same behavior
should work across all supported databases.

The suite is split by public capability:

```text
tests/
  fixtures/
  integration/
    bigint/
    count/
    builder/
    collection/
    metadata/
    migration/
    query/
    repository/
    schema/
    seed/
```

`bigint/` groups cross-API BIGINT precision scenarios for Query, Repository,
and database driver behavior. See its [coverage index](./bigint/README.md).
`count/` verifies safe number results for COUNT across all supported databases,
including aliases, DISTINCT, nulls, empty sets, groups, transactions and scalar
subqueries.
`builder/` covers Collection Builder DDL and metadata synchronization.
`collection/` covers the resolved Collection API for managed and external
Schemas. `metadata/` covers persistent Store, compare-and-swap, pagination, and
transaction behavior. `query/`, `migration/`, `schema/`, and `seed/` cover their
corresponding public APIs against real SQL execution.

`repository/` covers method contracts, parameter capabilities, identity,
relations, nested mutations, and array/iterator consumption. See its
[coverage and validation index](./repository/README.md).

Reusable typed scenario inputs live under `tests/fixtures/`. Resolver fixtures
pair physical Schema with supplemental Metadata and expected results;
integration fixtures provide inputs that tests apply through public APIs. They
are test data, not another source of runtime Collection truth.

The suite is owned by `@nocobase/db-testkit`; it does not create a connection
on its own. Run it through a dialect package, whose adapter supplies the
connection, native driver, and physical cleanup. Non-SQLite dialect packages
also own their Compose file and use the shared runner to create an isolated
project, bind a random host port, wait for health, run the suite, and remove
their containers, network, and volumes. By default, the SQLite package uses an
in-memory database:

```bash
pnpm --filter @nocobase/db-sqlite test:integration
```

Start and test PostgreSQL:

```bash
pnpm --filter @nocobase/db-postgres test:integration
```

Start and test MySQL:

```bash
pnpm --filter @nocobase/db-mysql test:integration
```

Start and test OceanBase CE:

```bash
pnpm --filter @nocobase/db-oceanbase test:integration
```

Oracle uses the larger `gvenzl/oracle-free:23-slim-faststart` image:

```bash
pnpm --filter @nocobase/db-oracle test:integration
```

Start and test SQL Server:

```bash
pnpm --filter @nocobase/db-mssql test:integration
```

Start and test Dameng:

```bash
pnpm --filter @nocobase/db-dameng test:integration
```

Run the complete database matrix through the owning package entrypoints:

```bash
pnpm --filter @nocobase/db test:integration:all
```

Each dialect package exposes its own `test:integration` command; use those entrypoints when selecting a single backend or the full matrix.

Set `KEEP_TEST_DB=1` to retain a failed run for debugging. The runner prints
the Compose project name; remove that project manually after investigation.

## Dialect acceptance

DB changes must pass the complete package suite, including all integration
tests, on SQLite, PostgreSQL, MySQL, Oracle, SQL Server, and Dameng. A
SQLite-only or Repository-only run is useful while iterating, but is not final
acceptance.

Run the matrix through the owning package entrypoints:

```bash
pnpm --filter @nocobase/db test:integration:all
```

The all-database invocation runs shared unit/type-test files once and repeats
the integration scenarios per configured database. Type assertions additionally
require `typecheck`. Missing drivers or unavailable services are failures, not
reasons to skip a database. A database-specific scenario may be conditional
only when its contract explicitly belongs to that database; the PostgreSQL
bigint-string transport scenario is one such case.

When the selected matrix includes SQL Server, the package configuration runs
test files serially: concurrent DDL fixtures can deadlock on shared catalog
rows even when their application table names differ. Do not override this
with file parallelism or run multiple matrix processes against the same
database. Concurrent-write scenarios still run concurrent operations inside
their test. Other database selections retain file parallelism.

A catalog deadlock inside a SQL Server transaction is not retried by the
inspector: SQL Server has rolled back the entire transaction, so retrying only
the read would incorrectly report earlier DDL as missing. The original driver
error remains the cause of `SCHEMA_INSPECTION_FAILED`. Nontransactional catalog
reads retain bounded retries.

The runner injects `*_HOST=127.0.0.1` and the dynamically published `*_PORT`
for the current Compose project. User-provided credentials and other
database-specific environment variables continue to override the Compose
defaults.
