---
'@nocobase/queue': patch
'@nocobase/app-server': patch
---

Finalize the application-scoped QueueService API, including QueueManager and withChannel, and remove the legacy Job, Locator, queue manager, driver exports, and old application provider/token. Remove obsolete runtime dependencies and clean build output so retired modules cannot remain in published artifacts.
