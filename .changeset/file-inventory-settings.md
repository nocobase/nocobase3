---
'@nocobase/app-plugin-file': minor
---

Add a permission-protected, read-only Files Settings inventory for standard database-backed file routes. Sources are registered automatically by `createFileRoute()`, grouped by table, isolated on read failures, and listed with paginated file metadata without exposing storage object keys.
