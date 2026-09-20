---
'@nocobase/app-plugin-notification': minor
'@nocobase/app-plugin-notification-in-app': minor
'@nocobase/app-plugin-notification-providers': minor
'@nocobase/app-template-examples': patch
'@nocobase/app-template-default': patch
---

Require unique Channel instance names and use them for sending, routing, overrides, test sending, runtime isolation and retries. Preserve implementation types separately in delivery records and reject retries after a Channel type changes. Migrate existing Channel identities and update application configuration and integration guidance.
