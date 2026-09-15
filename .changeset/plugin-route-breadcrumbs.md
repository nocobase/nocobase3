---
'@nocobase/app-plugin-workflow': patch
'@nocobase/app-plugin-notification': patch
'@nocobase/app-plugin-authorization': patch
'@nocobase/app-plugin-ai-employee': patch
'@nocobase/app-plugin-file-example': patch
'@nocobase/app-plugin-repository-example': patch
---

Declare `breadcrumb` on the routes that belong in a breadcrumb trail.

A menu title no longer implies a breadcrumb title: `navigation` puts a route in a menu and `breadcrumb` puts it in
a trail, independently of each other. Each navigation group and the pages under it now state both, so a page inside
one of these plugins still shows the path that leads to it.

Routes with neither children nor a parent are left alone. Their trail would be a single level, which renders
nothing, so a `breadcrumb` there would have no effect.
