---
'@nocobase/db': patch
---

`updateMany` and `deleteMany` with `select`, and bulk updates checked against a Policy scope, no longer fail on SQLite past about a thousand rows with "Expression tree is too large". The writes, scope checks and reloads that address every locked row by key now run in batches of 200 keys inside the same transaction. A nested hasOne `create` on a source that already has a target now detaches the current target before inserting the new one, as `connect` does, instead of failing with the database's unique constraint error; when the foreign key cannot be cleared it fails with `RELATION_ACTION_NOT_ALLOWED` and writes nothing.
