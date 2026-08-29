---
'@nocobase/app-server-kit': minor
'@nocobase/app-template-default': patch
'@nocobase/create-plugin': patch
'@nocobase/app-plugin-authentication': patch
'@nocobase/app-plugin-authorization': patch
'@nocobase/app-plugin-file': patch
'@nocobase/app-plugin-install': patch
'@nocobase/app-plugin-notification': patch
'@nocobase/app-plugin-notification-in-app': patch
'@nocobase/app-plugin-queue-example': patch
'@nocobase/app-plugin-realtime-example': patch
'@nocobase/app-plugin-routes-example': patch
'@nocobase/app-plugin-service-provider-example': patch
'@nocobase/app-plugin-workflow': patch
---

Replace separate API and root route arrays with one ordered `routes` contribution array. Route factories now receive the Application, create and return their own Hono router, and are mounted automatically at `/api` or the application root according to their definition.

Standardize plugin server modules around `providers/index.ts` and `routes/index.ts` collection entries, `services/` domain implementations, and a stable `tokens.ts` public contract.
