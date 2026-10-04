---
'@nocobase/app-plugin-authorization-example': major
'@nocobase/app-plugin-departments-example': major
'@nocobase/app-plugin-jobs-example': major
'@nocobase/app-plugin-notification-example': major
'@nocobase/app-plugin-queue-example': major
'@nocobase/app-plugin-template-print-example': major
---

Move the example plugins' routes onto the HTTP API specification. Each example now depends on `zod`, which validates its route input.
