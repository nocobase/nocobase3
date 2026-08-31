---
'@nocobase/app-plugin-i18n': patch
'@nocobase/app-client': patch
'@nocobase/app-server': patch
'@nocobase/dev-config': patch
---

Add language switching on top of `@nocobase/app-i18n`. Applications and plugins declare their locales the same way on both sides, the browser loads only the language it is showing, and the chosen one is kept in storage and mirrored to the server session.
