---
'@nocobase/app-plugin-file': minor
---

Add a read-only Files Settings page for standard database-backed file routes. Sources are registered automatically by `createFileRoute()` and listed with cursor-paginated file metadata without exposing storage object keys. Authentication and Authorization are required runtime dependencies, and the page and API both enforce the `file.inventory` page access permission granted to system administrators through their wildcard page permission.
