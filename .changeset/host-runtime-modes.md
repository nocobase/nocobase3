---
'@nocobase/app-host': minor
'@nocobase/app-server': minor
'@nocobase/app-template-default': patch
'@nocobase/app-template-hub': patch
---

Add standalone and Hub-managed host modes, startup-only YAML or JSON host configuration, FS and S3 release deployment through NocoBase Drive, strict desired deployment reconciliation, file configuration path selection, host-owned structured logging, shared ws-backed App WebSocket handling, private authenticated child-process management over Node IPC, and bounded managed-host crash recovery. Rename the Host's in-process runtime implementation to `InProcessAppHandle`.
