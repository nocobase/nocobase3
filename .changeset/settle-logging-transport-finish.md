---
'@nocobase/logging': patch
---

Allow logging transport shutdown to complete when the writable stream finishes before its worker emits `close`.
