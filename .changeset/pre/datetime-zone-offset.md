---
'@nocobase/db': minor
---

Store an offset-bearing ISO string in a `datetime` Field as the local wall clock it names, and validate temporal strings written through `database.query()`.

`datetime` is a wall-clock type, so a value carrying `Z` or `±HH:MM` is not something it can hold as written. Repository refused such a value outright, while `database.query()` passed every string to the driver untouched: `2026-09-06T09:30:00Z` was accepted by the write and then stored verbatim on SQLite, where the first read of the row failed with `FIELD_CAPABILITY_NOT_SUPPORTED` because no valid local value carries an offset. Every other dialect took the write too and silently dropped the offset, giving one value on PostgreSQL and a different one on MySQL.

Both writers now converge on one answer: the offset is applied and the instant is stored as the host's local reading of it, which is exactly where the equivalent `Date` value has always landed. `2026-09-06T09:30:00Z`, `2026-09-06T17:30:00+08:00` and `new Date('2026-09-06T09:30:00Z')` are one value for a host at `+08:00`, through `createOne`, `createMany`, `updateOne`, `updateMany`, `upsertOne`, and Query `insertInto` and `updateTable`. `datetimeTz` is unchanged and still keeps the instant. Rows already holding an offset, which only SQLite could store, are read back through the same conversion rather than failing.

Temporal strings written through `database.query()` are now validated the way Repository has always validated them, so a value that cannot be stored is reported at the write instead of at a later read. This rejects shapes the query builder used to accept silently, including the space-separated `2026-08-14 10:00:00`: write `2026-08-14T10:00:00`, or pass a `Date`.
