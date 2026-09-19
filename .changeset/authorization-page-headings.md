---
"@nocobase/app-client": minor
"@nocobase/app-plugin-authorization": patch
"@nocobase/app-plugin-authz-default-access": patch
"@nocobase/app-plugin-authz-sharing-rules": patch
"@nocobase/app-plugin-authz-restriction-rules": patch
---

Support settings navigation order across plugin contributions. Place the authorization inspector after rule management and align authorization page headings with other settings pages.

Each rule plugin owns its shadcn primitives instead of importing them from the authorization management API.
