---
'@nocobase/db': patch
---

The `nocobase-db` Skill now says which values a write has to carry. A Collection has exactly the fields its `createCollection` callback declares, every field builder passes its options through unchanged, and `increments` is the only one that makes the database produce the value — so audit timestamps and any primary key that is not `increments` are supplied by the writing code or by a `defaultValue` in the migration. A `createdAt` declared `nullable: false` otherwise fails the insert with the database's NOT NULL error, and a `uuid` primary key left out of `values` fails with `INVALID_UNIQUE_SELECTOR`, because a create identifies the record it has just written by a complete, non-null primary or unique selector.
