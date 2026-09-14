---
'@nocobase/app-server': patch
---

Map the Repository Policy error codes to their HTTP status: the read and scope
refusals answer 403 rather than 400, and an upsert onto a record outside the
scope answers 409.
