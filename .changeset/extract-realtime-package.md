---
'@nocobase/app-client': major
'@nocobase/app-server': patch
'@nocobase/app-plugin-authentication': patch
---

Extract the shared realtime wire protocol and browser WebSocket client into `@nocobase/realtime`. Replace the session-specific client reconnect method with a transport-level `reconnect()` operation, and make the application client and server consume the shared package.
