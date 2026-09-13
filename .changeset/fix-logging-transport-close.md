---
"@nocobase/logging": patch
---

Handle the normal `finish` event when closing logging transport streams so rolling file transports do not hang during shutdown.
