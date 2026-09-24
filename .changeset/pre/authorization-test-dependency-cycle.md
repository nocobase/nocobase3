---
'@nocobase/app-plugin-authorization': patch
'@nocobase/app-plugin-authz-default-access': patch
'@nocobase/app-plugin-authz-sharing-rules': patch
'@nocobase/app-plugin-authz-restriction-rules': patch
---

Remove the authorization workspace dependency cycle by keeping rule plugin dependencies one way and running cross-plugin coverage in the authorization example. Verify each rule plugin's management handler and migration in its own test suite.
