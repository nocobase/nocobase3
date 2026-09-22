---
'@nocobase/db': patch
---

Read temporal values through the result normalizer in Repository, and resolve a stored timestamp on the UTC pivot

Repository decoded stored timestamps with the mutation validator rather than the result normalizer Query has always used, so the same row read through the two APIs could differ or fail on one of them. It now decodes through the result normalizer, which is what recognizes the shapes storage produces rather than the shapes a caller writes.

That matters most after a Field is converted between `datetime` and `datetimeTz`. The two types disagree about what a stored value is, and the physical column is not rewritten: a widened SQLite column holds text carrying no offset, which Repository rejected outright with `FIELD_CAPABILITY_NOT_SUPPORTED`, and a narrowed one holds text that carries one.

Both are now resolved on UTC, in both directions, for the same reason MySQL's `datetime(3)` already pivots there: it is the only reading that does not depend on the host the row is read on, so one database reports the same value everywhere and a Field converted one way and back returns what it started with. A previously stored offset in a `datetime` value therefore reads as the instant's UTC wall clock rather than the host's — writing keeps resolving a caller's offset against the host, where a caller is present and `Date` semantics apply.

PostgreSQL still converts these columns by reading each value in the session time zone, so a migration that widens or narrows one has to pin that session to UTC itself.
