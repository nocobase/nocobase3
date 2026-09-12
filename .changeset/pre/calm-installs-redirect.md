---
'@nocobase/app-server': patch
'@nocobase/app-host': patch
---

Expose application configuration paths to server plugins and add helpers for mounting redirect responses below an application's base path. Application hosts now rewrite root-relative redirects returned by embedded applications so installation and other redirects remain inside the mounted application.
