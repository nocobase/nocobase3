---
'@nocobase/db': patch
---

Read temporal columns that still hold epoch milliseconds from before the query builder normalized temporal Fields, so an application upgraded in place on SQLite can read its existing users, sessions, and records instead of failing with `FIELD_CAPABILITY_NOT_SUPPORTED`.
