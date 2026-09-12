---
'@nocobase/app-plugin-file': patch
'@nocobase/app-plugin-notification': patch
'@nocobase/app-plugin-notification-in-app': patch
---

Correct the `@nocobase/app-portal-sdk` range these Registry recipes declare. It named `^2.0.0`, a version the v3 package never had, so installing one of these recipes into an application could not resolve the dependency it needs for its v2 API calls.
