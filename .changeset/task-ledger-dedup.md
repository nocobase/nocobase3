---
"@nocobase/db": patch
---

Keep one implementation of the task ledger and the source loader behind the two kinds, and apply the history table's column upgrade to the seed ledger as well.

Migrations and seeds keep separate ledgers because only one of them is reversible, but the table, its reads and writes, and most of loading a source directory were the same work written twice: the two `internal/history.ts` modules differed by one column and their names, and the two loaders by which fields a definition must define. The shared halves now live in `migration/internal/history.ts` and `migration/internal/task-loader.ts`, with each kind naming its own table and messages — the arrangement the task locks already use. Every exported function keeps its name and signature, and no message changes.

The duplication had a cost beyond size: a change to one side could be forgotten on the other, which is how the seed ledger never got the `package_name` column upgrade the migration ledger has. It has it now, so a ledger created before that column existed is upgraded in place on the next run rather than failing its first read.
