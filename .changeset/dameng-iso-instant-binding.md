---
'@nocobase/db-dameng': patch
---

Bind ISO-8601 instant strings as native DATETIME values so physical queries and writes no longer fail with DM error `-6118` (`illegal date/time type data`). Repository bindings wrapped in `to_timestamp(...)` are unaffected because they never end in `Z`.
