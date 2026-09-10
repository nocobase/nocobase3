---
'@nocobase/app-server': minor
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Move concrete database driver loading to the application composition root.
Applications register only the dialect packages they install, while the
app-server runtime stays independent of every concrete database driver.
