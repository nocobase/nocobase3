---
'@nocobase/db': patch
---

Preserve undefined temporal query values before dialect encoding so optional notification delivery timestamps use insert defaults or remain unchanged on update instead of becoming invalid date strings.
