---
"@nocobase/db": patch
---

Reject collection reads whose input resolves to a different logical collection name, instead of silently omitting logical field metadata. Use the logical name for get, getResolution, and getPhysical; inspect physical table names through schemaInspector.getPhysicalCollection.
