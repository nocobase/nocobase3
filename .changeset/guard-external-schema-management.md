---
'@nocobase/db': major
'@nocobase/app-server': minor
---

Replace the legacy database connection `managed` flag with the explicit `schemaManagement` mode, and prevent external-schema connections from executing Builder DDL or migrations while retaining query access and dry-run compilation. Remove unused Collection `writable`, Field `interface` and `uiSchema` properties, and implicit virtual-field metadata creation.
