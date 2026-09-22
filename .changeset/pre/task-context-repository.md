---
'@nocobase/db': minor
'@nocobase/app-server': patch
---

Give migrations and seeds a `repository` on their context, bound to the connection the task runs on.

`query` reaches rows through the Connection naming strategy and expresses exactly what it is given, which leaves three things for each task to assemble by hand: cross-dialect field encoding, Collection-level naming overrides, and relation writes including the junction rows behind a `belongsToMany`. `context.repository(name)` covers them, taking the Collection as the database itself records it — the metadata a previous `builder` operation wrote — rather than importing any application definition.

The two contexts default differently. A migration changes structure, so `builder` and `query` remain its tools and `repository` is for the writes `query` would get wrong; a migration that uses it should say in a comment why `query` was not enough, keep it out of `down`, and not walk a table with it. A seed changes no structure and writes installation data in Collection terms, so `repository` is its normal tool and `query` covers what that cannot express.

Inside a transaction the Repository comes from the transaction's own connection, so a failed task discards its writes. This is what the database task service container has been protecting: resolving the application's `DatabaseManager` there would have produced a Repository writing outside the task's transaction, and its refusal now names the supported path instead of only refusing.
