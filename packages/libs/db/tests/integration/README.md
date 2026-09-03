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
    schema/
    seed/
```

`builder/` covers Collection Builder DDL and metadata synchronization.
`collection/` covers the resolved Collection API for managed and external
Schemas. `metadata/` covers persistent Store, compare-and-swap, pagination, and
transaction behavior. `query/`, `migration/`, `schema/`, and `seed/` cover their
corresponding public APIs against real SQL execution.

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
