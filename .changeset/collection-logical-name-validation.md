---
"@nocobase/db": patch
---

Reject collection reads whose input resolves to a different logical collection name, instead of silently omitting logical field metadata. Use the logical name for get, getResolution, and getPhysical; inspect physical table names through schemaInspector.getPhysicalCollection.

Refresh the collection naming index when metadata documents are created or removed, including field-only metadata, so explicitly declared underscored logical names remain valid during and after migrations.
