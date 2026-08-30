---
'@nocobase/app-plugin-i18n': patch
---

Request the locale endpoint under the application's base path. It was hard-coded to the origin root, so switching language on an app served from a base path posted to a URL that did not exist.
