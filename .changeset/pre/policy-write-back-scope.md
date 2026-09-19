---
'@nocobase/db': minor
---

Enforce the Repository Policy write-back invariant: a created or updated record
must still satisfy that operation's scope once the write lands, or the
transaction rolls back with `SCOPE_VIOLATION`. An upsert whose target exists
outside `update.scope` raises `RECORD_OUTSIDE_SCOPE` instead of degrading to an
insert, and no longer merges the scope into the unique selector that locates
the target.
