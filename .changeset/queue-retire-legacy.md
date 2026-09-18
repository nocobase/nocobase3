---
'@nocobase/queue': minor
'@nocobase/app-server': major
---

Breaking pre-1.0 queue migration: replace the legacy Job, Locator, global queue manager, and driver APIs with application-owned QueueService factories, per-queue QueueManager facades, and withChannel. Replace QueueProvider and queueManagerToken with QueueServiceProvider and queueServiceToken from @nocobase/app-server/queue. Register handlers during Provider boot and await their unregistration during shutdown. Publication returns a receipt, not synchronous completion. Remove obsolete runtime dependencies and clean build output so retired modules cannot remain in published artifacts.

Stop old producers and drain or manually account for old-engine work before cutover. Old workers cannot resume BullMQ backlog, including during rollback; no automatic backlog migration, replay, or deletion is performed.
