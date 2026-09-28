---
'@nocobase/db': minor
'@nocobase/db-sqlite': minor
'@nocobase/app-server': minor
---

A busy migration or seed lock throws `TaskLockBusyError` (checked with `isTaskLockBusyError()`), carrying the lock table, the holder, its heartbeat and whether it expired, instead of a plain `Error`; the messages are unchanged. `Seeder.history()` reads the executed seeds without taking a lock, as `Migrator.history()` does for migrations. The application's database task runner accepts `dryRun` for `run` and reports the pending migrations and seeds per connection in each result's `pending`, which `nocobase db apply --dry-run` uses. A driver may implement `hasStorage(config)` to say whether the local storage a connection opens exists yet; `@nocobase/db-sqlite` checks for the database file. A dry run consults it and answers for an empty database rather than preparing storage and connecting, so previewing an application whose SQLite file does not exist yet no longer creates it.
