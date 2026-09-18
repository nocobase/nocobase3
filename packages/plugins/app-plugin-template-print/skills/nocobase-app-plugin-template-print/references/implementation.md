# Application implementation

## Ownership and v3 integration

For one business feature, keep the action, routes, rendering adapter, and templates in its existing App module. Extract a reusable business plugin only when the user needs reusable runtime behavior. This Skill package itself supplies neither implementation nor an importable render function.

In a v3 source workspace, a new runtime plugin uses `plugin:create` with the required explicit capabilities. In an installed App, follow its module conventions instead of assuming workspace scaffolding is available. v3 uses explicit Client and Server contributions, Hono routes, and application services. Legacy `Plugin.load()`, `ctx.action`, Formily schemas, `SchemaInitializer`, `uiButtonSchemasRoles`, and `client-v2` FlowEngine models are source references, not v3 extension APIs.

Keep the boundaries small:

- The route authenticates, validates the request, authorizes template use and data access, and returns binary content or a structured error.
- A business data loader applies the current principal's row, field, and relation permissions and returns a plain render DTO.
- A renderer receives an authorized template asset, DTO, and explicit options. It owns document processing and conversion, with no browser request or ORM dependency.
- The UI selects a template and print scope, shows progress/errors, and downloads the result through the App's authenticated API client.

Reuse the installed App's authz and file contracts. For database authorization, request the fields needed by the template and apply the resulting database conditions in the query itself. A guard granting a print action does not grant unrestricted access to its records. A template-management permission is separate from permission to use that template and from permission to read business data.

## Request and query contract

Use an App-owned template ID, output format, explicit record scope, and validated locale/timezone. Look up the storage key, data source, collection, and root data shape on the server. Reject a template whose collection/source/root shape is incompatible with the action. Do not accept a caller-provided filesystem path or arbitrary renderer options.

| Scope                | Query semantics                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Record               | Normalize the full primary key, including composite keys; read one authorized record. Missing/inaccessible records produce the App's appropriate error.                                               |
| Selected records     | Intersect selected IDs with authorized rows and any explicitly retained business filter. Preserve a documented order. Decide whether partial authorization rejects the batch or reports omitted rows. |
| Current page         | Preserve filter, stable sort, page and page size.                                                                                                                                                     |
| All filtered records | Preserve filter and stable sort, remove page offset, and apply an independent server-side maximum.                                                                                                    |

Combine user filters and policy filters with logical AND. Use the actual installed query API rather than copying the legacy `$and` representation. Allowlist query options so caller-supplied `fields`, relation loading, offset, or limit cannot override policy. The old action resets offset whenever a filter exists; this changes current-page semantics and must not be transferred unconditionally.

The legacy implementation rejects arrays above 300 records after fetching them. Treat 300 as a historical product limit, not a Carbone limit. Enforce the target App's chosen cap while fetching, for example with a bounded `limit + 1` query and a clear over-limit error. Bound child-row counts and image bytes too; a single parent may contain a large dataset. Handle an empty array explicitly because it is truthy in JavaScript.

## Template fields and render data

Extract template markers using an Office-aware parser: tags can be split across XML text runs. Resolve the referenced relation paths against current collection metadata, then intersect them with allowed fields and relations before loading. Request `customer` and `lines.product` only when needed, with depth/cycle limits and permissions at each relation level. A field-picker UI is a convenience, not a security boundary.

Create a plain DTO without mutating ORM `dataValues`. Preserve numeric zero, boolean false, Unicode, and the distinction between missing and empty values. Define how decimals, dates, and large IDs serialize. Keep IDs as strings when numeric precision is unsafe.

The legacy option-field convention is `{ value, label }`, or an array of those objects. It allows `{d.status.label}` while retaining `{d.status.value}`. Resolve labels in the requested locale and define a fallback for unknown enum values. The old helper assumes model objects and can recurse into an array as if it were a model; use separate array/object branches and explicit DTO shaping instead.

## Fixed and uploaded templates

A fixed business template can be an App asset. Include it in the server build and resolve it from a known module/resource base so it remains available when running `dist/` in another working directory. An upload workflow instead needs managed file storage and template metadata: ID, display name, storage reference, source/collection, object-or-array root shape, format, and revision. Cache parsed markers only by template revision/content hash and relevant schema version, never by filename alone.

For uploaded Office files, validate extension and actual ZIP/OOXML structure, size and expansion limits, and entry paths. Generate storage keys server-side. Treat replacement as a new revision; retain a consistent template snapshot for in-flight renders and clean up failed uploads. Use self-contained migrations if persistence is required.

Templates and rendered documents may contain private data. Reuse the App's file repository service under explicit authorization. Generic file content routes may be public even when metadata APIs have a policy; verify the installed File Skill and protect the actual download paths. A private disk or a hard-to-guess URL is not sufficient.

## Downloads and execution

Return the correct format MIME type and a safe `Content-Disposition` with UTF-8 `filename*` plus a fallback name. The client should request binary output, distinguish JSON errors from a document, respect response filenames, and release object URLs after use. Use explicit timezone consistently in both query-variable resolution and render formatting.

For PDF, verify a compatible converter, fonts, writable temporary space, timeout, concurrency limit, and cleanup in the deployed environment. Keep conversion in a bounded worker when it is expensive; a timed-out HTTP request alone does not stop a converter process. Log template/revision IDs, counts, duration, and error stage, not full business records or signed URLs.
