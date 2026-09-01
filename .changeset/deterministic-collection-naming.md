---
'@nocobase/db': major
---

Remove arbitrary Collection `tableName` and Field `columnName` mappings while retaining Connection- and Collection-level `underscored` and `tablePrefix` naming options. Collection renames now update the physical table and metadata together, reject dependencies that cannot be updated atomically, and validate legacy physical-name mappings before a connection starts. Query table sources now accept Connection-relative identifiers and automatically apply the Connection `tablePrefix`; complete physical table names must use the underlying connection client instead.
