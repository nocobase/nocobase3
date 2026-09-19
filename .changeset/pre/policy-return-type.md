---
'@nocobase/db': minor
---

Degrade the record type a policy-bound Repository returns: binding a `read`
node makes reads come back as `Partial<TRecord>`, since a query with no select
returns `read.fields` alone. `read: true` keeps the complete record type.
