---
'@nocobase/db-postgres': patch
'@nocobase/db-kingbase': patch
---

Keep the private query-stream constructor boundary independent of PostgreSQL native type declarations so strict workspace consumers can typecheck application imports without undeclared pg types.
