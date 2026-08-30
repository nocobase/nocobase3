---
'@nocobase/app-server-kit': minor
'@nocobase/app-template-default': patch
---

Add reusable Node HTTP, WebSocket, and standalone server definition adapters with graceful shutdown handling, Vite overrides, mounted application lifecycle ownership, standard listen configuration, and startup cleanup. Reduce the default template standalone entry to binding its root directory, Runtime Definition, and shared server factory. Derive the application package name from its root package metadata and keep standard standalone routing defaults in the Node runtime instead of repeating them in each Runtime Definition.
