---
"@nocobase/app-plugin-mail": patch
---

Unify pagination across mail account tables, the management message table, and log views with numbered pages including the last page, direct page entry, and a shared page-size selector. Support offset-based message queries for direct page selection while retaining cursor pagination.

Keep the Mail center's original cursor pagination unchanged. Count matching messages and log records on the server, counting complete batches for bulk history.
