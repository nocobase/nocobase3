---
'@nocobase/app-plugin-notification': patch
---

Deliver notifications through the application QueueService with instance-local handlers. Register handlers without database access during boot and await in-flight deliveries before releasing channel providers. Preserve asynchronous delivery reconciliation and status reporting.
