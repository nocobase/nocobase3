---
'@nocobase/app-server': minor
'@nocobase/app-skills': patch
'@nocobase/db': minor
---

Applications now generate an OpenAPI 3.1 document for their `/api` routes and serve it at `GET /api/swagger`, with Swagger UI at `GET /api/swagger/docs`. The Swagger UI files ship in `@nocobase/app-server`'s `dist`; no CDN is involved and templates declare nothing.

`@nocobase/app-server/router` exports what a route declares itself with: `describeRoute()` and `resolver()` re-exported from `hono-openapi`, `apiValidator(target, schema)` — which validates a Standard Schema such as a zod schema, answers invalid input exactly as `parseApiInput()` does (`400 INVALID_ARGUMENT`, reason `INVALID_INPUT`, domain `app`, one field violation per issue) and documents the parameters or body — and the response helpers `dataResponse()`, `listResponse()`, `emptyResponse()`, `apiErrorResponse()` and `apiErrorResponses`, which reference the shared standard error body. `parseApiInput()` keeps working and is superseded. Plugins import these from `@nocobase/app-server/router` and must not declare `hono-openapi` themselves; `pnpm peers:check` now fails one that does.

Data endpoints from `defineRepositoryApiRoutes` are documented automatically: each action gets an operation whose record, `values` and filter schemas are read from the Collection field by field, with the filter operators each field accepts and a shared `RepositoryFilter` component describing the grammar. Fields a fixed Policy forbids are left out. `GET /api/healthz` is declared too.

The documentation is served only to requests an access check allows. Plugins register checks, and fragments for routes a library defines, through the new `apiDocsToken` service (`addAccess()`, `addFragment()`, `invalidate()`); until a check is registered the documentation routes answer `404 ROUTE_NOT_FOUND`, so an application without one publishes nothing. `inspectApiRoutes(app)` and `findUndeclaredApiRoutes(app)` report what each route of a started application declares, and `Application.apiRouter` exposes the assembled `/api` router. A plugin route under `/api/swagger` now fails start as a duplicate route.

`@nocobase/db` exports `filterOperatorsForFieldType()`, `supportsFilterShorthand()` and `isSortableFieldType()`, the tables the Repository validates filters and sorts against, so descriptions of the filter grammar are derived from them rather than copied.

The `nocobase-app-development` Skill's HTTP API reference describes the API documentation, how to declare and when to hide a route, and its input example uses `apiValidator()` and `describeRoute()`.
