---
'@nocobase/db': major
---

Remove arbitrary Collection `tableName` and Field `columnName` mappings while retaining Connection- and Collection-level `underscored` and `tablePrefix` naming options. Table Collection renames now update the physical table and metadata together, reject dependencies that cannot be updated atomically, and reject View or Materialized View renames until kind-specific DDL is supported. Legacy physical-name mappings are validated before a connection starts. Query table sources now accept Connection-relative identifiers and automatically apply the Connection `tablePrefix`; complete physical table names must use the underlying connection client instead.
