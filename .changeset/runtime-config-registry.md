---
'@nocobase/app-server-kit': minor
'@nocobase/app-template-default': minor
'@nocobase/app-plugin-authentication': minor
'@nocobase/app-plugin-file': patch
'@nocobase/app-plugin-install': patch
'@nocobase/app-plugin-notification': minor
'@nocobase/app-plugin-service-provider-example': patch
'@nocobase/app-plugin-workflow': minor
'@nocobase/caching': minor
'@nocobase/drive': minor
'@nocobase/id-generator': minor
'@nocobase/logging': minor
'@nocobase/queue': minor
'@nocobase/session': minor
'@nocobase/config': patch
---

Replace aggregated application configuration objects and config factories with typed module-owned configuration definitions. Applications now compose defaults, file providers, environment layers, validation, explicit reloads, and subscriptions through `AppConfig`, while providers read their configuration through `app.config.get(definition)`.
