---
'@nocobase/app-client': patch
---

A page without `authz` no longer stops the application

Since route `authz` became mandatory, one page that omitted it made route registration throw and the whole application failed to start. A missing `authz` is now resolved instead of rejected. A nested page inherits the effective `authz` of its nearest ancestor page, through groups and any number of levels, whether that is a resource check, `'skip'` or `'unrestricted'`; a child that declares its own value overrides it for its subtree. The first page on a path that omits it gets a default by surface: a protected App page (`auth: 'required'`) or a settings page becomes `'unrestricted'`, so it registers but only identities with unrestricted access, such as root, may open it or see it in a menu, while a `guest` or `optional` App page or a dev page becomes `'skip'`. Development builds log one warning per defaulted page naming its id, path and default; production logs nothing.

`AppClientRouteAuthz` gains the `'unrestricted'` value, which a page may also declare explicitly for a root-only page. It is never offered as a page grant. Malformed `authz` values, the removed `access` field and `authz` on a group are still rejected.
