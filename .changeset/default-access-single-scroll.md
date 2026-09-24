---
'@nocobase/app-plugin-authorization': patch
'@nocobase/app-plugin-authz-default-access': patch
---

Fit the default access page to the available height on large screens, so the page no longer scrolls around the resource table that already scrolls on its own. `PermissionsPage` gains an opt-in `fill` prop and `ManagementTable` accepts a `className` for pages that lay out their own scroll regions; on viewports too short for a usable layout the page keeps a minimum height and scrolls once as a whole.
