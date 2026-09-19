---
'@nocobase/db': patch
---

Normalize JSON field values at the Repository and Query API boundaries so
direct JSON columns accept and return structured `JsonValue` values across
database drivers.
