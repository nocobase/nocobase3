---
'@nocobase/app-server': minor
'@nocobase/app-skills': patch
'@nocobase/db': minor
---

Applications now generate an OpenAPI 3.1 document for their `/api` routes and serve it at `GET /api/swagger`, with Swagger UI at `GET /api/swagger/docs`. The Swagger UI files ship in `@nocobase/app-server`'s `dist`; no CDN is involved and templates declare nothing.

`@nocobase/app-server/router` exports what a route declares itself with: `describeRoute()` re-exported from `hono-openapi`, `resolver(schema, direction?)`, `apiValidator(target, schema)` — which validates a Standard Schema such as a zod schema, answers invalid input exactly as `parseApiInput()` does (`400 INVALID_ARGUMENT`, reason `INVALID_INPUT`, domain `app`, one field violation per issue) and documents the parameters or body — and the response helpers `dataResponse()`, `listResponse()`, `emptyResponse()`, `apiErrorResponse()` and `apiErrorResponses`, which reference the shared standard error body. `parseApiInput()` keeps working and is superseded. Plugins import these from `@nocobase/app-server/router` and must not declare `hono-openapi` themselves; `pnpm peers:check` now fails one that does.

Data endpoints from `defineRepositoryApiRoutes` are documented automatically: each action gets an operation whose record, `values` and filter schemas are read from the Collection field by field, with the filter operators each field accepts and a shared `RepositoryFilter` component describing the grammar. Fields a fixed Policy forbids are left out. `GET /api/healthz` is declared too.

The documentation is served only to requests an access check allows. Plugins register checks, and fragments for routes a library defines, through the new `apiDocsToken` service (`addAccess()`, `addFragment()`, `invalidate()`); until a check is registered the documentation routes answer `404 ROUTE_NOT_FOUND`, so an application without one publishes nothing. `inspectApiRoutes(app)` and `findUndeclaredApiRoutes(app)` report what each route of a started application declares, and `Application.apiRouter` exposes the assembled `/api` router. A plugin route under `/api/swagger` now fails start as a duplicate route.

Schemas are converted under the document's conventions rather than hono-openapi's defaults. A response object is open unless its zod schema is strict (`z.strictObject()` or `.strict()`), so adding a response field is not a breaking change; a request body validated with `z.strictObject()` stays closed. A recursive schema such as `z.json()` becomes a component named by its `ref`, or `JsonValue`, or `Recursive<hash>` for another anonymous one, instead of a converter-generated `__schema0` that collided across routes or a `$ref` into `#/$defs` that resolved nowhere. A property whose schema is a shared one keeps its own description next to the `$ref`, and the shared component keeps its own. `apiValidator('header', ...)` leaves `Accept`, `Authorization` and `Content-Type` out of the parameters, as OpenAPI ignores them there. `findApiDocumentSchemaProblems(document)` lists unresolved references and converter-generated component names, for a test to expect none.

`@nocobase/db` exports `filterOperatorsForFieldType()`, `supportsFilterShorthand()` and `isSortableFieldType()`, the tables the Repository validates filters and sorts against, so descriptions of the filter grammar are derived from them rather than copied.

The `nocobase-app-development` Skill's HTTP API reference describes the API documentation, how to declare and when to hide a route, and its input example uses `apiValidator()` and `describeRoute()`.
