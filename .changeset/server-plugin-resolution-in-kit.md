---
'@nocobase/app-server-kit': minor
'@nocobase/app-template-default': patch
---

Move server plugin manifest resolution, Provider loading, and database or queue contribution discovery into the public `@nocobase/app-server-kit/plugins` entry. The default application template now consumes the shared implementation.
