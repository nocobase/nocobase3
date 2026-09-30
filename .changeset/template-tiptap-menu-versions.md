---
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Pin `@tiptap/extension-bubble-menu` and `@tiptap/extension-floating-menu` with the rest of the Tiptap family, so a generated application no longer resolves them to a newer version whose `@tiptap/core` peer it does not satisfy.
