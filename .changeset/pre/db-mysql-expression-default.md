---
'@nocobase/db': patch
---

Stop reporting a MySQL expression default as a generated column

MySQL describes a column whose default has to be written as an expression with `EXTRA = 'DEFAULT_GENERATED'`, and the schema inspector matched on the word `GENERATED`. That is the wrong signal: `DEFAULT_GENERATED` describes a default, while a generated column reports `VIRTUAL GENERATED` or `STORED GENERATED` and is the only kind that carries a `GENERATION_EXPRESSION`. The inspector now derives it from that expression.

Two things were wrong while it did not. The column's default was dropped from the introspected schema, and the Repository refused to write the column at all — `createOne` and `updateOne` rejected it as `FIELD_NOT_WRITABLE`, "managed by the database or Repository".

Every defaulted `json` column on MySQL was affected, because MySQL accepts no literal default on `json` and the builder therefore emits `DEFAULT (json_object())` for one. A Collection declaring `collection.json('options').notNull().defaultTo({})` could not have its `options` written on MySQL, while the same Collection worked on every other database.
