---
'@nocobase/app-host': patch
---

Wait for prior revision cache cleanup before resolving or restoring the next deployment. Reject configuration publishing when the application is not registered or has no runtime configuration file instead of reporting success.
