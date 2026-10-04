---
'@nocobase/app-plugin-file': patch
'@nocobase/app-plugin-notification': patch
'@nocobase/app-plugin-notification-in-app': patch
'@nocobase/app-plugin-scheduler': patch
'@nocobase/app-plugin-database-explorer': patch
---

Declare every hand-written `/api` route of the file, notification, in-app notification, scheduler and Database Explorer plugins in the application's API document at `/api/swagger/docs`, with response schemas and the error statuses each route answers. The file plugin documents the `uploadOne` and `uploadMany` endpoints of each exposure as `multipart/form-data` beside that exposure's data endpoints, under its tag and with operationIds such as `attachmentsUploadOne`. Route input is now validated through `apiValidator()`, which answers invalid input exactly as before.
