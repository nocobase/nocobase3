---
'@nocobase/authorization': minor
'@nocobase/app-plugin-authorization': minor
'@nocobase/app-plugin-authz-default-access': minor
'@nocobase/app-plugin-authz-sharing-rules': minor
'@nocobase/app-plugin-authz-restriction-rules': minor
'@nocobase/app-client': minor
'@nocobase/app-plugin-workflow': patch
'@nocobase/app-plugin-scheduler': patch
'@nocobase/app-plugin-hub': patch
'@nocobase/app-plugin-users': patch
'@nocobase/app-plugin-notification': patch
'@nocobase/app-plugin-notification-in-app': patch
'@nocobase/app-plugin-notification-provider': patch
'@nocobase/app-plugin-ai-employee': patch
'@nocobase/app-plugin-authorization-example': patch
'@nocobase/app-plugin-file-example': patch
'@nocobase/app-plugin-registry-example': patch
'@nocobase/app-plugin-repository-example': patch
'@nocobase/app-plugin-routes-example': patch
'@nocobase/app-skills': patch
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Consolidate the authorization API. Resource types are either catalog types (`settings`, `business`, `database.collection`), whose items and actions must be registered, or record types (`page`, `user`, `notification`, `hub.app`, `hub.host`), which declare type-level actions and judge each record; there are no `*` items. Display is separate from judgement: `authz.sections` holds the top-level sections `pages`, `business` and `administration` and one level of subsections (`sections.add({ name, title, parent })`), which replace the display groups; business resources and settings items name a subsection with `section`, anything else lands in its type's `defaultSection` "Other"; `authz.resourceGroups` adds optional right-side headings; `authz.groups` is removed and resource types are never displayed. A plugin that contributes to a subsection another plugin owns passes `extend: true`, mirroring an extended client settings group: workflow owns `automation` and scheduler extends it. A resource holds at most one default-access rule: the table is unique on `(resourceType, resourceId)` as well as `key`, and a second rule raises `DefaultAccessConflictError`, answered with 409. `authorizationToken` is the only service token: `permissionSetsToken` is gone, `authz.db` is now `authz.database`, the `resource` type is now `business`, settings items are registered with `authz.settings.add` and checked with semantic actions, and rule plugins build on `@nocobase/app-plugin-authorization/server/extension`. The client exposes `AuthorizationClient.snapshot/revision/invalidate/onInvalidated` and renamed management components. Every client page route must now declare `authz` (a check or `'skip'`); nothing is inferred from the route name. The authorization migrations were edited in place, including the new `key` column on default-access rules, so existing databases must be reset and reinstalled.
