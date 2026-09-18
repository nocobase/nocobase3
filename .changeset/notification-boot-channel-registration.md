---
'@nocobase/app-plugin-notification': patch
---

Defer notification channel and provider validation until activation so channel plugins can register their definitions during application boot. Cover database-free boot, migration-before-start delivery, and draining an active notification before application dependencies close.
