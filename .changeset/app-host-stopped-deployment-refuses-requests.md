---
"@nocobase/app-host": patch
---

Stop a managed deployment for real: a stopped App now has its definition disabled so a request through the Host returns 404 instead of cold-starting it again, and `startDeployment` re-enables it. Previously stopping only evicted the runtime and the next public request resumed serving.
