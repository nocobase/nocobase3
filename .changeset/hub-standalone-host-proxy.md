---
'@nocobase/app-server': minor
'@nocobase/app-plugin-hub': patch
'@nocobase/app-template-hub': patch
---

Add optional standalone HTTP and WebSocket proxy routing and configure Hub to forward paths outside its public mount to the current ready App Host port. Preserve public request identity and streaming, release proxy connections during shutdown, and use the shared public entry for hosted application links.
