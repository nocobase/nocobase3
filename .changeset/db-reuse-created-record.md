---
'@nocobase/db': patch
---

Avoid issuing a second SELECT after creating a record when no relations need to be loaded.
