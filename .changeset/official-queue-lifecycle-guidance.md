---
'@nocobase/queue': patch
---

Use BullMQ's official Redis backend and public Queue/Worker lifecycle APIs instead of service-owned driver adapters. Bound producer waits independently while tracking accepted operations through late settlement, validate publication receipts, and coordinate draining pauses with handler registration and shutdown. Keep lazy initialization on its own setup budget so an expired publication neither closes shared initialization nor dispatches after its deadline. Update the queue documentation for explicit native client adaptation, shared-client ownership, best-effort metadata readiness, publication-time scheduling validation, and failed or unconfirmed cleanup when a draining pause races force-close.

Document the known Redis Cluster normal-pause/reconnection limitation in BullMQ 6.3.6 with ioredis 5.11.1: last-handler unregistration and resume can remain pending even after handler completion. Retain draining pauses without third-party patches; complete Cluster lifecycle acceptance remains deferred.
