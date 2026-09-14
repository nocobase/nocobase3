---
'@nocobase/db': minor
---

Constrain relation write targets by `RelationWriteNode.scope`. A `connect`,
`disconnect`, `set`, `delete`, or relation `update`/`upsert` now locates its
target within that scope, so a caller confined to their own rows can no longer
attach or modify somebody else's through a relation.
