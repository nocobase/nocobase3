---
'@nocobase/app-server': patch
'@nocobase/create-app': patch
'@nocobase/app-plugin-hub': patch
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Use `auth.secret` as the default secret for application sessions, while preserving an explicit `session.secret` override. Generated configuration examples now contain one canonical secret.
