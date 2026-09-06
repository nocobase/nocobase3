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
    builder/
    collection/
    metadata/
    migration/
    query/
    repository/
    schema/
    seed/
```

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

By default, the integration suite uses an in-memory SQLite database:

```bash
npm run test:integration
npm run test:integration:sqlite
```

Start and test PostgreSQL:

```bash
npm run test:db:up:postgres
npm run test:integration:postgres
```

Start and test MySQL:

```bash
npm run test:db:up:mysql
npm run test:integration:mysql
```

Oracle uses the larger `gvenzl/oracle-free:23-slim-faststart` image:

```bash
npm run test:db:up:oracle
npm run test:integration:oracle
```

Start and test SQL Server:

```bash
npm run test:db:up:mssql
npm run test:integration:mssql
```

Start the complete Docker database matrix and run the integration suite against SQLite, PostgreSQL, MySQL, Oracle, and SQL Server:

```bash
npm run test:db:up:all
npm run test:integration:all
```

Stop and remove the test databases:

```bash
npm run test:db:down
```

For an ad hoc database combination, set `INTEGRATION_DB_CONNECTIONS` on a direct Vitest invocation:

```bash
INTEGRATION_DB_CONNECTIONS=postgres,mysql pnpm exec vitest run tests/integration
INTEGRATION_DB_CONNECTIONS=oracle pnpm exec vitest run tests/integration
```

## Five-database acceptance

DB changes must pass the complete package suite, including all integration
tests, on SQLite, PostgreSQL, MySQL, Oracle, and SQL Server. A SQLite-only or
Repository-only run is useful while iterating, but is not final acceptance.

With all four database services available, run from this package directory
using Node 24 or later:

```bash
INTEGRATION_DB_CONNECTIONS=all pnpm exec vitest run
pnpm lint
pnpm typecheck
pnpm build
pnpm api:check
pnpm typecheck:examples
pnpm typecheck:playground
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

Use a dedicated Compose project for local validation. Stop its services after
the run and retain volumes unless their deletion was explicitly requested.
The `test:db:down` command above removes data volumes and is not a routine
cleanup command for a shared or user-owned test environment.

Default Docker connection settings:

```text
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=15432
POSTGRES_USER=nocobase
POSTGRES_PASSWORD=nocobase
POSTGRES_DATABASE=nocobase_collection_builder

MYSQL_HOST=127.0.0.1
MYSQL_PORT=13306
MYSQL_USER=nocobase
MYSQL_PASSWORD=nocobase
MYSQL_DATABASE=nocobase_collection_builder

ORACLE_HOST=127.0.0.1
ORACLE_PORT=11521
ORACLE_USER=nocobase
ORACLE_PASSWORD=nocobase
ORACLE_SERVICE_NAME=FREEPDB1

MSSQL_HOST=127.0.0.1
MSSQL_PORT=11433
MSSQL_USER=sa
MSSQL_PASSWORD=NocoBase_Mssql_2026
MSSQL_DATABASE=nocobase_collection_builder
```
