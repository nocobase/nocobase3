---
name: nocobase-app-plugin-authz-restriction-rules
description: Configure restriction rules in a NocoBase 3 application's authorization config and register its client and server plugin.
---

# @nocobase/app-plugin-authz-restriction-rules

Restriction Rules management for NocoBase applications. The pure rule engine and Store contract remain in `@nocobase/authorization/restriction-rules`. This package owns the database Store and migration, administration HTTP routes, settings resource, client page and feature translations.

Register the default export from `./client` in the application's client plugins and the default export from `./server` in its server plugins. Import `restrictionRules` from `./server` and include `restrictionRules()` in `server/config/authorization.ts` alongside any other rule factories. `@nocobase/app-plugin-authorization` must be registered on both sides.

The settings page remains `/settings/authorization/restriction-rules` and contributes to the existing `authorization` group with `parent`. Management endpoints remain `/api/authz/restriction-rules`, with options, record selection and subject selection subroutes. Every endpoint requires authentication and the matching action on `settings` resource `authorization.restriction-rules`. If the rule factory is absent from authorization config, no management endpoints are installed.

The optional factory `store` argument replaces persistence. Database migrations retain their original names and contents and now belong to this package; this source-level split assumes a fresh installation. Rules adjust record scope for already granted actions and do not grant action or field access.

Use this skill when adding, removing or configuring this rule feature in an application. Keep UI and management HTTP implementation in this plugin; the application owns plugin lists and authorization configuration. Use the feature's database migrations through the application migration lifecycle. Do not write tables or migration history manually. Keep record-scope rules separate from permission-set action grants.

Business resource rules use `resource: { type: 'resource', id: businessResourceName }` and an action entry with `action` plus `scopeKey`. The named scope registration determines the underlying collection used for conditions and record selection. Rules stay on the matching business grant branch. Underlying collection rules remain supported; a collection restriction applies to every branch. Sharing does not grant an operation or implicitly share related records.
