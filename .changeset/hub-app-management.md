---
'@nocobase/app-server': minor
'@nocobase/app-host': patch
'@nocobase/app-plugin-hub': patch
'@nocobase/app-template-default': patch
'@nocobase/app-template-hub': patch
---

Register the Application Hub in the Hub template and provide a production-style application control plane. Release artifacts now supply their version and an optional `config.yml` template, while applications choose Config file or External configuration and reserve Hub-managed configuration for a future database-backed implementation. Hub actions reconcile only the selected application, reuse an already installed matching artifact, report deployment phase timings, and support removing an application and its persisted resources.
