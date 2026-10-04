---
'@nocobase/app-plugin-users': patch
'@nocobase/app-plugin-authorization': minor
'@nocobase/authorization': minor
'@nocobase/app-plugin-authz-default-access': patch
'@nocobase/app-plugin-authz-restriction-rules': patch
'@nocobase/app-plugin-authz-sharing-rules': patch
'@nocobase/app-plugin-i18n': patch
---

The user management routes under `/api/users`, every authorization route under `/api/authorization` (the permission snapshot, Permission Sets, the inspector, and the default-access, sharing-rule and restriction-rule settings) and `GET /api/i18n/locales` are now described in the application's OpenAPI document, with their parameters, response schemas and error statuses, and listed in Swagger UI at `/api/swagger/docs` under the `Users`, `Authorization` and `I18n` tags. `GET /api/i18n/locales` declares `security: []`, because the sign-in page reads it before anyone is signed in. `PUT /api/i18n/locale` is hidden from the document because it only changes the browser's session. Input validation answers exactly as before.

The settings routes behind the `/api/authorization` dispatcher are forwarded at request time, where the document generator cannot see them, so the authorization plugin contributes them as a document fragment built from every `authz.routes` registration. Routes registered through `authz.routes.add(path, createRouteHandler(router))` are documented automatically at their full `/api/authorization/...` path; declare each route of the router with `describeRoute()`. A handler that is a plain function rather than a `createRouteHandler` router keeps working but cannot be described: the plugin logs a warning naming its path, and the new `undeclaredAuthorizationRoutes(authz.routes)` reports it, together with any router route that declares nothing, so a plugin's tests can assert the list is empty. `createRuleSupportRoutes` accepts an optional `name` for its operation ids, and the extension exports `AUTHORIZATION_API_TAGS`, `authorizationApiFragment`, `undeclaredAuthorizationRoutes` and response schemas such as `SubjectRuleSchema` and `TotalMetaSchema`.

`AuthorizationRouteRegistry` in `@nocobase/authorization/core` gains `entries()`, which lists every registration with its handler, sorted by path like `list()`.

The default-access, sharing-rule and restriction-rule plugins no longer declare `hono`, which none of their code imports.
