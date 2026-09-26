---
'@nocobase/app-plugin-authorization': patch
---

Check unrestricted access from the client, and never offer unrestricted-only pages as grants

`AuthorizationClient.can` and `useCan` accept `'unrestricted'` in addition to a `{ resource, action }` check, typed as the new exported `AuthorizationRequirement`. It passes only when the session's permission snapshot is unrestricted, as root's is, and nothing can grant it. Route guards and menus use it for pages whose `authz` is `'unrestricted'`, which is what a protected App or settings page without a declared `authz` now defaults to.

The permission workspace and inspector list only routes whose `authz` checks `page` `access`, so an unrestricted-only page is never offered as a page grant. The client development guidance in the plugin's Skill now describes `authz` inheritance, the defaults for a page that omits it, and the unrestricted requirement.
