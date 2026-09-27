---
'@nocobase/app-server': minor
'@nocobase/app-template-default': minor
'@nocobase/app-template-examples': minor
'@nocobase/app-template-hub': minor
---

A standalone application keeps its data under `APP_STORAGE_DIR` when it is set, absolute or relative to the deployment root, instead of `storage/` in the deployment root. Set it when the deployment root is replaced on every release, as an installer that keeps one directory per release does. Explicit storage paths still take precedence, and embedded applications keep the volume their host provides. The Hub template still reads `HUB_STORAGE_DIR`, the name earlier releases documented, when `APP_STORAGE_DIR` is not set; existing deployments need no change.
