---
"@nocobase/db": patch
---

Reject collection lookups that resolve to another logical collection's physical table with a COLLECTION_NAME_MISMATCH diagnostic, instead of silently losing metadata and reporting misleading field type errors.
