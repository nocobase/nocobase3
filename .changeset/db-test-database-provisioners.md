---
'@nocobase/db': minor
'@nocobase/db-sqlite': minor
'@nocobase/db-postgres': minor
'@nocobase/db-mysql': minor
---

`@nocobase/db/testing` exports `TestDatabaseProvisioner`, the contract a dialect package implements so `@nocobase/db-testing` can create isolated databases on it, with `ProvisionedTestDatabase`, `TestDatabaseProvisionOptions` and `TestDatabaseEnvironment`. `@nocobase/db-sqlite`, `@nocobase/db-postgres` and `@nocobase/db-mysql` export one as `testDatabaseProvisioner` from a new `./testing` entry: SQLite opens a fresh `:memory:` database, PostgreSQL creates a schema in the database its `POSTGRES_*` variables name, and MySQL creates a database through the administrative account in `MYSQL_ADMIN_USER` and `MYSQL_ADMIN_PASSWORD` (or `MYSQL_ROOT_PASSWORD`). `postgresTestConnection()` and `mysqlTestConnection()` return the connection options those variables describe. PostgreSQL and MySQL also implement the optional `listProvisioned` and `dropProvisioned`, which `@nocobase/db-testing` uses to remove the databases an interrupted run left behind; `TestDatabaseListOptions` describes the first.
