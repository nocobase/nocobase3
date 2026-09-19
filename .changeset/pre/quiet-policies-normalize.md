---
'@nocobase/db': minor
'@nocobase/repository-input': patch
---

Add the Repository Policy read model: policy types, scope normalization, scope
pushdown into the query, and field and relation allowlists enforced across
every read surface — select, filter, sort, distinct, cursor, aggregate and
group by, including the returning select of a write and each relation branch,
which is judged by its own collection's allowlist and narrowed by its own
scope.
