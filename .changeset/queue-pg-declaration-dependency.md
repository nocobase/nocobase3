---
'@nocobase/queue': patch
---

Publish the PostgreSQL declaration dependency required by the queue's exported connection types. Memory-only TypeScript consumers no longer need to discover and install an undeclared @types/pg dependency; the pg runtime remains optional.
