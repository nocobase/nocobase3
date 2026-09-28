---
'@nocobase/app-plugin-notification': minor
'@nocobase/app-plugin-notification-in-app': minor
'@nocobase/app-plugin-notification-providers': minor
'@nocobase/app-template-examples': patch
'@nocobase/app-template-default': patch
---

Use unique Channel map keys for sending, test sending, runtime isolation and retries. Preserve message types separately in delivery records and reject retries after the original Channel or Provider becomes unavailable. Migrate existing Channel identities and update application configuration and integration guidance.
