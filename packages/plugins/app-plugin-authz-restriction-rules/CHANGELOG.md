# @nocobase/app-plugin-authz-restriction-rules

## 0.1.0-beta.1

### Patch Changes

- 808bf34: Remove the authorization workspace dependency cycle by keeping rule plugin dependencies one way and running cross-plugin coverage in the authorization example. Verify each rule plugin's management handler and migration in its own test suite.
- Updated dependencies [cda1175]
- Updated dependencies [e286e0d]
- Updated dependencies [808bf34]
- Updated dependencies [4e58fe3]
- Updated dependencies [4e58fe3]
- Updated dependencies [4e58fe3]
- Updated dependencies [4e58fe3]
- Updated dependencies [4e58fe3]
- Updated dependencies [80ef702]
  - @nocobase/app-plugin-authentication@1.0.0-beta.21
  - @nocobase/app-plugin-authorization@0.2.0-beta.18
  - @nocobase/app-server@1.0.0-beta.25
  - @nocobase/db@1.0.0-beta.15
  - @nocobase/app-client@1.0.0-beta.19
  - @nocobase/i18n@1.0.0-beta.4

## 0.1.0-beta.0

### Minor Changes

- 64b3fdb: Support entry-level parent references for settings routes contributed by different plugins. Preserve route ownership and localization while resolving nested groups independently of plugin order.

  Split default access, sharing rules and restriction rules into application plugins that own management endpoints, stores, migrations and UI. Keep pure authorization rules and Store contracts in the authorization library and move permission-set management HTTP handlers to the application plugin. Update all application templates to explicitly compose the new plugins. The migration ownership change assumes a fresh installation.

### Patch Changes

- 64b3fdb: Separate business resource declarations from underlying handler registration through `resourceTypes`. Remove transitional registration aliases and legacy title decoding. Store rule record IDs directly in each action's JSON, preserving independent named scopes without auxiliary record tables. Initialize the sales example and Hub permission titles directly in their final form, without development-version upgrade scripts.
- 64b3fdb: Return translation descriptors for authorization options and translate them on the client. Language changes update resource, action, group, scope and subject labels without reloading permission data or discarding edits. Rule plugins expose their resource titles in client locales.
- 64b3fdb: Document business authorization development, scope-rule configuration, inherited subjects and server enforcement in the published Skills, with application-level guidance to select the authorization workflow. Make installed Skills self-contained with client integration, code-versus-seed decisions, complete API contracts and the current sales collaboration and delivery examples.
- 64b3fdb: Remove obsolete database field editors, user-directory helpers, and unused authorization management components. Preserve underlying grant policies when saving permission sets, share scope labels across rule plugins, and centralize unsaved-change handling in the permission workspace.
- 64b3fdb: Support settings navigation order across plugin contributions. Place the authorization inspector after rule management and align authorization page headings with other settings pages.

  Each rule plugin owns its shadcn primitives instead of importing them from the authorization management API.

- 64b3fdb: Disable rule creation and show setup guidance when no eligible business resources are defined. Remove fallback raw resource IDs and free-form action inputs from management editors.
- 64b3fdb: Focus authorization Skills on designing and implementing application business permissions. Consolidate repeated API guidance, add a policy-bound transactional workflow example, require model development and accompanying business permission configuration according to each requested change, and correct seed imports and optional-rule examples.
- 64b3fdb: Remove unused seed-directory declarations so server inspection succeeds in clean checkouts and installed applications without local empty directories.
- 64b3fdb: Add composed business operations with named data scopes and categorized business and administration groups. Permission and rule editors expose only this catalog; page, collection and custom resource handlers remain internal authorization targets.

  Enforce per-operation default access, sharing and restriction scopes while preserving field permissions. Return resolved underlying decisions and repository policies for inspection and execution.

  Use translation descriptors for permission titles, integrate permission-set assignments into user management, and demonstrate independent project, quote and order scopes with direct and team-based assignments.

- 64b3fdb: Remove Refine from client authorization checks. Use `AuthorizationClient.can({ resource, action })` instead of the removed two-argument signature, and import `useCan` from `@nocobase/app-plugin-authorization/client`. Migrate page guards, navigation, and notification visibility while preserving session isolation and realtime permission invalidation.

  Remove the Refine access-control configuration and legacy global authorization client accessors. Resolve the application-owned client through `useAuthorizationClient()` or `authorizationClientToken`. Settings actions now revoke stale access immediately; route checks no longer bypass the authorization page or translate Refine CRUD action names.

  Unify route authorization under `authz: 'skip' | { resource: { type, id }, action }`. Normalize default rules during registration and share them across page guards, navigation, permission discovery, and inspection. Remove the legacy `access` field and string resource adapter.

  Limit settings action checks to the actions each page uses, keep the permission-set action helper internal, and avoid rebuilding navigation twice when selecting a route.

- 64b3fdb: Improve restriction rule table column sizing, align rule names to the left, display action scopes on separate lines, and remove the duplicate explanatory notice.
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [fe564d9]
- Updated dependencies [fe564d9]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
- Updated dependencies [64b3fdb]
  - @nocobase/app-client@1.0.0-beta.19
  - @nocobase/authorization@0.1.0-beta.8
  - @nocobase/app-plugin-authorization@0.2.0-beta.15
  - @nocobase/app-server@1.0.0-beta.21
  - @nocobase/app-plugin-authentication@0.1.0-beta.18
  - @nocobase/db@1.0.0-beta.11
  - @nocobase/i18n@1.0.0-beta.4

## 0.0.1

### Patch Changes

- Provide restriction-rules rule persistence, administration endpoints and settings UI.
