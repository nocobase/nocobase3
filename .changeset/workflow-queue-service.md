---
'@nocobase/app-plugin-workflow': patch
---

Use the application QueueService for workflow tasks instead of a global job dispatcher and plugin-owned workers. Register instance-local handlers during provider boot and await their unregistration during shutdown. Deliver tasks asynchronously and accept delays in milliseconds.
