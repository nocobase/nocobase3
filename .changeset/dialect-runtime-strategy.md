---
'@nocobase/db': major
'@nocobase/app-server': patch
'@nocobase/db-postgres': patch
'@nocobase/db-mysql': patch
'@nocobase/db-sqlite': patch
'@nocobase/db-oracle': patch
'@nocobase/db-mssql': patch
---

Expose the dialect runtime strategy contract used by database connections and
the Knex-backed query, repository, schema, and application composition
adapters. Dialect packages now own connection defaults, ownership identity, and
local storage preparation, while the database configuration API accepts
additional dialect identifiers without core changes.
