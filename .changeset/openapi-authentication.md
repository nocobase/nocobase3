---
'@nocobase/app-plugin-authentication': minor
'@nocobase/app-plugin-api-keys': minor
---

Let signed-in sessions and API keys read the application's OpenAPI document, and document Better Auth's endpoints in it.

- `@nocobase/app-plugin-authentication` registers an access check that lets a request with a valid session read `GET /api/swagger` and the Swagger UI at `GET /api/swagger/docs`; the session is resolved without extending its expiry or setting cookies. It also merges Better Auth's endpoints into the document from Better Auth's own OpenAPI generator, at their full `/api/auth/...` paths and tagged `Authentication`, including those of the Better Auth plugins the application configures. Browser-only steps (social sign-in and account linking, the OAuth callback, email links and the error page) are left out, and Better Auth's own `/reference` page is not served. The `/api/auth/*` route is declared hidden. `Auth.getSession()` accepts `{ disableRefresh: true }`, `Auth.plugin(id)` returns a configured Better Auth plugin, and `Auth.openAPISchema()` returns Better Auth's generated description.
- `@nocobase/app-plugin-api-keys` registers an access check that lets a request carrying a valid, enabled, unexpired API key read the same document. `apiKey()` now exposes its configurations as `options.configurations`, and the server entry exports `findRequestApiKey()` and `createApiKeyApiDocsAccess()`.
