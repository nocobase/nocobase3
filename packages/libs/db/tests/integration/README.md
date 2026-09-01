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
```

Start PostgreSQL and MySQL with Docker Compose:

```bash
npm run test:db:up
```

Oracle uses the larger `gvenzl/oracle-free:23-slim-faststart` image and starts separately:

```bash
npm run test:db:up:oracle
```

Run the same integration suite against SQLite, PostgreSQL, MySQL, and Oracle after all three containers are healthy:

```bash
npm run test:integration:all
```

Stop and remove the test databases:

```bash
npm run test:db:down
```

The database matrix is controlled by `INTEGRATION_DB_CONNECTIONS`, for example:

```bash
INTEGRATION_DB_CONNECTIONS=postgres,mysql npm run test:integration
INTEGRATION_DB_CONNECTIONS=oracle npm run test:integration
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
```
