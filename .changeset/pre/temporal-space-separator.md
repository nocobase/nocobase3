---
'@nocobase/db': patch
---

Accept `YYYY-MM-DD HH:mm:ss` when writing a `datetime` or `datetimeTz` value

Reading has always accepted the space separator, because it is the shape catalogs and drivers hand back, while writing required the `T` and reported a value that "is not a valid V1 temporal value" without naming the separator. The two halves of one contract disagreed, and the literal they disagreed about is the one every SQL dialect spells.

Both writers now normalize it, so `'2026-09-02 09:00:00'` and `'2026-09-02T09:00:00'` store the same canonical value. The space is unambiguous — no valid V1 value carries one — and this only widens what is accepted, so nothing that worked before changes.
