---
'@nocobase/app-client': patch
'@nocobase/app-plugin-file': minor
'@nocobase/app-portal-sdk': patch
---

Support FormData requests in the v3 App client without overriding the browser's multipart boundary.

Remove the File plugin's Portal SDK dependency and v2 authentication behavior. `createFilesClient()` now requires the owning application's v3 `AppClient`, accepts endpoints relative to the application `/api` root, and relies exclusively on Cookie authentication.
