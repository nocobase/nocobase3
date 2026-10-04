---
'@nocobase/app-plugin-users': patch
'@nocobase/app-plugin-authorization': minor
'@nocobase/app-plugin-authz-default-access': patch
'@nocobase/app-plugin-authz-restriction-rules': patch
'@nocobase/app-plugin-authz-sharing-rules': patch
'@nocobase/app-plugin-i18n': patch
---

The user management routes under `/api/users`, every authorization route under `/api/authorization` (the permission snapshot, Permission Sets, the inspector, and the default-access, sharing-rule and restriction-rule settings) and `GET /api/i18n/locales` are now described in the application's OpenAPI document, with their parameters, response schemas and error statuses, and listed in Swagger UI at `/api/swagger/docs` under the `Users`, `Authorization` and `I18n` tags. `PUT /api/i18n/locale` is hidden from the document because it only changes the browser's session. Input validation answers exactly as before.

The settings routes behind the `/api/authorization` dispatcher are invisible to the document generator, so `@nocobase/app-plugin-authorization/server/extension` adds `addSettingsRoutes(authz.routes, path, handler)`: it registers the handler as `authz.routes.add` does and records the router behind a `createRouteHandler` handler, and the authorization plugin contributes every recorded router's routes to the document as a fragment. A rule plugin built on the extension should register its handler with `addSettingsRoutes` and declare each route with `describeRoute()`; a handler passed to `authz.routes.add` directly keeps working but is not documented. `createRuleSupportRoutes` accepts an optional `name` for its operation ids, and the extension exports `AUTHORIZATION_API_TAGS`, `documentedSettingsRouters`, `authorizationApiFragment` and response schemas such as `SubjectRuleSchema` and `TotalMetaSchema`.
