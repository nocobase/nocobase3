# Integration Tests

These tests exercise Builder and Query behavior against real database
connections. They are intentionally organized under `tests/integration` rather
than by one database backend because the same behavior should work across all
supported databases.

The suite is split by public capability:

```text
tests/integration/
  builder/
  query/
```

`builder/` covers Collection Builder DDL and metadata behavior. `query/` covers
the QueryAdapter API against real SQL execution.

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
