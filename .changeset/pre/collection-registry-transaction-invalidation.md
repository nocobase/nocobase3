---
'@nocobase/db': minor
---

Isolate Collection Metadata and Registry changes inside database transactions, publish targeted invalidations after commit, discard them after rollback, and invalidate Collection caches after Migration batches.
