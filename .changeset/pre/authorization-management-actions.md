---
'@nocobase/app-plugin-authorization': patch
'@nocobase/app-plugin-authz-default-access': patch
'@nocobase/app-plugin-users': patch
---

Separate permission-set assignment management from CRUD, use one configure permission for default access, and register an independent permission inspector with its own options and subject selection endpoints. Reflect the operations in management controls and the user inspection shortcut.
