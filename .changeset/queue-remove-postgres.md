---
'@nocobase/queue': minor
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Remove the built-in PostgreSQL queue backend, its connection types, migration and connection lifecycle adapters, and optional pg dependency. Built-in queue backends are now inMemory and Redis, including Redis Cluster. Existing PostgreSQL queue configurations must be replaced explicitly; there is no automatic fallback or backlog migration. Application PostgreSQL database support is unchanged.

Update application development guidance to use Redis for persistent queues.
