---
'@nocobase/app-plugin-service-provider-example': patch
'@nocobase/app-plugin-authentication': patch
'@nocobase/app-plugin-authorization': patch
'@nocobase/app-plugin-install': patch
'@nocobase/app-plugin-queue-example': patch
'@nocobase/app-plugin-realtime-example': patch
'@nocobase/app-plugin-routes-example': patch
'@nocobase/app-server': patch
'@nocobase/app-template-default': patch
'@nocobase/caching': patch
'@nocobase/drive': patch
'@nocobase/snowflake': patch
'@nocobase/logging': patch
'@nocobase/queue': patch
'@nocobase/service-provider': patch
'@nocobase/session': patch
---

Add a focused ServiceProvider plugin example with a tokenized heartbeat
service, lifecycle management, and an HTTP status route. Pass the Application
directly to providers and standardize service access through `app.container`.
