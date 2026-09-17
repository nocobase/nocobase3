---
'@nocobase/create-plugin': patch
---

Generate application-scoped QueueService handlers and lifecycle providers for the server.jobs capability instead of Job subclasses and queue.jobs discovery. Verify generated jobs-only and combined service plugins by compiling and executing their asynchronous queue tests.
