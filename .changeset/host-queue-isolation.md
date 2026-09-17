---
'@nocobase/app-host': patch
---

Clarify that stop-first application replacement preserves its lifecycle and rollback contract rather than compensating for process-global queue state. Verify that destroying one hosted application's queue leaves another application's queue running.
