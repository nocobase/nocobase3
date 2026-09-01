---
'@nocobase/logging': patch
'@nocobase/app-server': patch
---

Close logging transport workers during application shutdown to prevent full application test suites and server processes from hanging during cleanup.
