---
'@nocobase/app-server': patch
---

Report every database connection whose driver is missing at once, with one `pnpm add` that installs them all.

Resolution stopped at the first connection without a driver, so a configuration missing two — the Examples template on PostgreSQL still needs SQLite for its analytics connection — took two failed starts to discover, each naming half of the problem. The error is now a `MissingDatabaseDriversError`, exported from `@nocobase/app-server/database`, whose `missing` lists each connection with its dialect and package, so tooling can point at every one.
