---
'@nocobase/app-plugin-file': minor
---

Add a read-only Files Settings page for standard database-backed file routes. Sources are registered automatically by `createFileRoute()` and listed with cursor-paginated file metadata without exposing storage object keys. The page and API use the `file.inventory` page permission when Authorization is available, fall back to authenticated access without Authorization, and stay unmounted when Authentication is unavailable.
