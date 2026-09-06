---
'@nocobase/db': major
---

Replace the accidental flat export surface with a single Agent-oriented root API. Internal Knex, collection composition, migration history and locking, and seed history and locking implementations are no longer package exports. The root entry includes the reusable `CollectionOperation` plan type accepted by `CollectionBuilder.apply()`. The public package entry is protected by a value-and-type API baseline, and published builds now contain source output only.
