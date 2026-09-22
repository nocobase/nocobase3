---
"@nocobase/db": minor
---

Let a Collection be created again when its metadata outlived its physical table.

`createCollection` resolved the Collection it was about to create, which fails with `COLLECTION_SCHEMA_DRIFT` when a metadata record survived without its table — the state a corrected migration re-runs into, and the state a hand-rolled reset leaves behind. The resolved definition was then discarded and replaced by the operation's own, so the lookup could only fail, never inform the operation. Collections that these operations define themselves are no longer resolved; referenced Collections still are, and every other operation on a Collection whose table is missing still reports the drift.
