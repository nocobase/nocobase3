---
'@nocobase/db': minor
---

Add `ref(target)` for reusing another Collection's read node inside
`read.relations`. References resolve against the same `withPolicies` map and
are expanded when the map is bound, so a cycle or a missing target is a
configuration error rather than a failure at request time.
