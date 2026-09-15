---
'@nocobase/app-plugin-notification': patch
---

Store notification timestamps as UTC instants so database reads and writes preserve the same time across dialects and host time zones.
