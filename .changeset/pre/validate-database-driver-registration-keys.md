---
'@nocobase/db': patch
'@nocobase/app-server': patch
---

Require each driver registration key to match the driver's declared dialect in inferred database configurations. Reject aliases and mismatched keys even when no connection uses that driver or the connections map is empty, while preserving connection inference for correctly registered factories and descriptors.
