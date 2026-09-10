---
'@nocobase/db': major
'@nocobase/db-postgres': patch
'@nocobase/db-mysql': patch
'@nocobase/db-sqlite': patch
'@nocobase/db-oracle': patch
'@nocobase/db-mssql': patch
---

Move all concrete dialect connection resolution, schema inspectors, native
driver loading, pool hooks, precise integer codecs, and capability profiles into
the corresponding dialect packages. `@nocobase/db` now requires an explicitly
registered dialect driver and no longer exports concrete dialect inspectors or
native-driver fallbacks.
