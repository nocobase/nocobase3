---
'@nocobase/db': minor
'@nocobase/app-server': minor
---

A busy migration or seed lock throws `TaskLockBusyError` (checked with `isTaskLockBusyError()`), carrying the lock table, the holder, its heartbeat and whether it expired, instead of a plain `Error`; the messages are unchanged. `Seeder.history()` reads the executed seeds without taking a lock, as `Migrator.history()` does for migrations. The application's database task runner accepts `dryRun` for `run` and reports the pending migrations and seeds per connection in each result's `pending`, which `nocobase db apply --dry-run` uses.
