---
'@nocobase/db-sqlite': patch
'@nocobase/db-mysql': patch
'@nocobase/db-oracle': patch
'@nocobase/db-mssql': patch
'@nocobase/db-testkit': patch
---

Give every dialect package a `check` script.

`db-sqlite`, `db-mysql`, `db-oracle`, `db-mssql` and
`db-testkit` gain the `check` script the other dialect packages already had;
`db-testkit` also typechecks its unit and integration trees there, which its
base `typecheck` does not cover.
