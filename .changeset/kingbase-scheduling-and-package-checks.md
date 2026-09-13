---
'@nocobase/db': patch
'@nocobase/db-sqlite': patch
'@nocobase/db-mysql': patch
'@nocobase/db-oracle': patch
'@nocobase/db-mssql': patch
'@nocobase/db-testkit': patch
---

Expose Kingbase through the database integration test scripts, and give every
dialect package a `check` script.

`@nocobase/db` gains `test:integration:kingbase`, and `test:integration:all`
now includes it, so the documented full-verification path stops skipping the
dialect silently. `db-sqlite`, `db-mysql`, `db-oracle`, `db-mssql` and
`db-testkit` gain the `check` script the other dialect packages already had;
`db-testkit` also typechecks its unit and integration trees there, which its
base `typecheck` does not cover.
