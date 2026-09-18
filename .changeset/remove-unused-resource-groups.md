---
"@nocobase/authorization": minor
"@nocobase/app-plugin-authorization": patch
---

Remove unused resource-handler group registries and item grouping metadata. Derive page display groups exclusively from client navigation routes, including pages also registered by the server, while keeping business resource groups separate.
