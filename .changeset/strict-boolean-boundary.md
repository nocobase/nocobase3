---
'@nocobase/db': patch
---

Normalize boolean field values at the Repository and Query API boundaries so
direct boolean columns accept and return JavaScript booleans consistently
across database drivers.
