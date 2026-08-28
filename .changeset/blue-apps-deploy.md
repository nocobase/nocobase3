---
'@nocobase/app-template-default': patch
'@nocobase/app-server-kit': patch
'@nocobase/create-app': patch
'@nocobase/hub-release-management': patch
'@nocobase/nb3-cli': patch
'@nocobase/hub': patch
---

Make generated App deployment executable end to end: persist the scoped NocoBase registry, add the deployment script and Hub guidance, accept App target URLs, serve artifacts from their runtime mount path, and give large uploads an independently configurable timeout.
