---
'@nocobase/nb3-cli': patch
'@nocobase/create-app': patch
'@nocobase/app-template-default': patch
'@nocobase/hub': patch
---

Add project-local pnpm workflows for building and uploading application artifacts, creating Releases, deploying applications, checking status, and authorizing a development device. Keep application source on the developer machine, keep the existing `nb3` executable available, and let `create-app` scaffold local source only from published or local templates.
