---
'@nocobase/app-template-hub': patch
---

Declare @nocobase/db as a runtime dependency alongside the SQLite driver, matching the Default and Examples templates. This lets TypeScript resolve the database configuration's inferred declaration through the public package path and prevents TS2883 when building a generated Hub application.
