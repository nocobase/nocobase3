---
'@nocobase/db': patch
---

Close five ways a relation write escaped its Policy scope: a to-one
`connect`/`disconnect` writing the root foreign key now triggers the root
write-back check, the relation scope reaches the to-one target resolved before
an insert, `disconnect` and `set` may only detach targets the scope can locate,
and a relation `update` is judged again after its values are applied.
