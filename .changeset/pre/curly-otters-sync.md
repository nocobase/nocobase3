---
'@nocobase/nb3-cli': patch
'@nocobase/create-app': patch
'@nocobase/app-template-default': patch
'@nocobase/hub': patch
---

Add project-local pnpm workflows for pulling and pushing Hub source snapshots, creating Releases, deploying applications, checking status, and authorizing a development device. Keep the existing `nb3` executable available, let `create-app` initialize an existing Hub application, and update the default template and Hub guidance to use the new scripts.
