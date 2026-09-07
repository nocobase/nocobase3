---
'@nocobase/db': minor
---

Remove the public Repository stream method and StreamOptions type. Consume findMany queries with await or for-await using the same filters, projections, relations, combine, sorting, distinct and pagination semantics. Relation and backward queries use a private disk buffer before batched relation loading; scalar forward queries retain driver streaming. Reject consumption after transaction completion and snapshot plain input data when consumption begins.
