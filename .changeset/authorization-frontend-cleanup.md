---
"@nocobase/app-plugin-authorization": patch
"@nocobase/app-plugin-authz-default-access": patch
"@nocobase/app-plugin-authz-sharing-rules": patch
"@nocobase/app-plugin-authz-restriction-rules": patch
---

Remove obsolete database field editors, user-directory helpers, and unused authorization management components. Preserve underlying grant policies when saving permission sets, share scope labels across rule plugins, and centralize unsaved-change handling in the permission workspace.
