---
'@nocobase/app-plugin-file': minor
'@nocobase/app-file-example': patch
'@nocobase/app-template-default': patch
'@nocobase/app-template-hub': patch
'@nocobase/nb3-cli': patch
---

Replace the File plugin's legacy backend and client protocol with File Repository services, multipart uploads, and configurable content routes. Preserve its editable Registry components and adapt them to ClientFileRepository and contentUrl. Remove the separate File Repository package, rename its example to app-file-example, update application registration and Agent integration guidance, and accept explicit NocoBase package names in plugin lifecycle commands.

This is a breaking replacement of the old File API: access-token routes, inventory settings, FilesClient, and runtime component exports are removed. Applications own file collections and route security; metadata deletion retains storage objects. The example migration remains unchanged.

Scan app-file-example Client sources and published output for Tailwind utilities in both application templates.
