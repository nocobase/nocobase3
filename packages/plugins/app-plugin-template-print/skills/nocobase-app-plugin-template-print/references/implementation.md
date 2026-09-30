# Application implementation

## Ownership and v3 integration

For one business feature, keep the action, routes, rendering adapter, and templates in its existing App module. Extract a reusable business plugin only when the user needs reusable runtime behavior. This Skill package itself supplies neither implementation nor an importable render function.

In a v3 source workspace, a new runtime plugin uses `plugin:create` with the required explicit capabilities. In an installed App, follow its module conventions instead of assuming workspace scaffolding is available. Use explicit Client and Server contributions, Hono routes, and application services from the installed v3 packages.

Keep the boundaries small:

- The route authenticates, validates the request, authorizes template use and data access, and returns binary content or a structured error.
- A business data loader applies the current principal's row, field, and relation permissions and returns a plain render DTO.
- A renderer receives an authorized template asset, DTO, and explicit options. It owns document processing and conversion, with no browser request or ORM dependency.
- The UI selects a template and print scope, shows progress/errors, and downloads the result through the App's authenticated API client.

Reuse the installed App's authz and file contracts. For database authorization, request the fields needed by the template and apply the resulting database conditions in the query itself. A guard granting a print action does not grant unrestricted access to its records. A template-management permission is separate from permission to use that template and from permission to read business data.

For an authenticated API Route, resolve the installed authentication and authorization services, install `authentication.required()` and `authorization.middleware()` on the Route-owned path, and require the print action with `context.get('authz').require(...)`. Load records through a Policy-scoped Repository or equivalent server-owned conditions after those checks. Test the production Route contribution through `createRouter()` and verify that anonymous or denied requests fail before the data loader and Renderer run. The repository example at `packages/examples/app-plugin-template-print-example/server/routes/` shows `defineApiRoutes`, middleware composition, a page `access` check, Policy-scoped reads, and a raw byte response.

## Route example

This illustrates the v3 route boundary; imports, error handling, and target-owned renderer helpers are omitted. Replace the resource and collection with the target feature's authorization model. The complete example is in `packages/examples/app-plugin-template-print-example/server/routes/`.

```ts
const apiRoutes = defineApiRoutes(({ container }) => {
  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);
  const database = container.resolve(databaseManagerToken);
  const router = new Hono<AuthorizationEnv>();

  router.use('*', authentication.required(), authorization.middleware());
  router.get('/invoices/:id/print', async (context) => {
    await context.var.authz.require({
      resource: { type: 'page', id: 'example.sales.quotes' },
      action: 'access',
    });
    const decision = await context.var.authz.authorize({
      resource: { type: 'composite', id: 'example.sales.quotes' },
      action: 'view',
    });
    const policy = decision.conditions?.database?.[QUOTES] as
      | RepositoryPolicy
      | undefined;
    if (decision.effect === 'deny' || !policy?.read)
      throw new AuthorizationDeniedError(decision);

    const record = await database
      .repository(QUOTES)
      .withPolicy(policy)
      .findOne({ filter: { id: context.req.param('id') } });
    if (!record) return context.notFound();
    const document = await renderer.render(await createRenderRequest(record));
    return context.body(document.bytes, 200, {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': makeAttachmentDisposition(document.filename),
      'Content-Type': document.mimeType,
    });
  });
  return new Hono().route('/template-print', router);
});
```

The page permission gates the feature, and the Policy-scoped Repository gates row access; neither grants the other. Authenticate and authorize before loading the template, business data, or private attachments, and return renderer bytes rather than a filesystem path.

## Request and query contract

Use an App-owned template ID, output format, explicit record scope, and validated locale/timezone. Look up the storage key, data source, collection, and root data shape on the server. Reject a template whose collection/source/root shape is incompatible with the action. Do not accept a caller-provided filesystem path or arbitrary renderer options.

| Scope                | Query semantics                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Record               | Normalize the full primary key, including composite keys; read one authorized record. Missing/inaccessible records produce the App's appropriate error.                                               |
| Selected records     | Intersect selected IDs with authorized rows and any explicitly retained business filter. Preserve a documented order. Decide whether partial authorization rejects the batch or reports omitted rows. |
| Current page         | Preserve filter, stable sort, page and page size.                                                                                                                                                     |
| All filtered records | Preserve filter and stable sort, remove page offset, and apply an independent server-side maximum.                                                                                                    |

Combine user filters and policy filters with logical AND. Use the actual installed query API rather than hard-coding a query object shape from another version. Allowlist query options so caller-supplied `fields`, relation loading, offset, or limit cannot override policy. Preserve current-page semantics explicitly instead of resetting the offset when a filter exists.

Enforce the target App's chosen record cap while fetching, for example with a bounded `limit + 1` query and a clear over-limit error. Bound child-row counts and image bytes too; a single parent may contain a large dataset. Handle an empty array explicitly because it is truthy in JavaScript.

## Template fields and render data

Extract template markers using an Office-aware parser: tags can be split across XML text runs. Resolve the referenced relation paths against current collection metadata, then intersect them with allowed fields and relations before loading. Request `customer` and `lines.product` only when needed, with depth/cycle limits and permissions at each relation level. A field-picker UI is a convenience, not a security boundary.

Create a plain DTO without mutating ORM `dataValues`. Preserve numeric zero, boolean false, Unicode, and the distinction between missing and empty values. Define how decimals, dates, and large IDs serialize. Keep IDs as strings when numeric precision is unsafe.

Represent option fields as `{ value, label }`, or an array of those objects, when templates need both display labels and stored values. This allows `{d.status.label}` while retaining `{d.status.value}`. Resolve labels in the requested locale and define a fallback for unknown enum values. Use separate array/object branches and explicit DTO shaping instead of passing ORM model objects into the renderer.

## Fixed and uploaded templates

A fixed business template can be an App asset. Include it in the server build and resolve it from a known module/resource base so it remains available when running `dist/` in another working directory. TypeScript compilation does not copy DOCX/XLSX/PPTX files; add an explicit build asset-copy step, following `packages/examples/app-plugin-template-print-example/scripts/copy-assets.mjs`. An upload workflow instead needs managed file storage and template metadata: ID, display name, storage reference, source/collection, object-or-array root shape, format, and revision. Cache parsed markers only by template revision/content hash and relevant schema version, never by filename alone.

For uploaded Office files, validate extension and actual ZIP/OOXML structure, size and expansion limits, and entry paths. Generate storage keys server-side. Treat replacement as a new revision; retain a consistent template snapshot for in-flight renders and clean up failed uploads. Use self-contained migrations if persistence is required. When reusing NocoBase Drive storage, resolve `driveManagerToken`, select the configured disk, and read the authorized record's key with `disk.getStream(record.key)`; first authorize and load the file record through the appropriate Policy-scoped repository. The file plugin exports `serverFileRepositoryManagerToken` for its server file-repository API.

Templates and rendered documents may contain private data. Reuse the App's file repository service under explicit authorization, but do not use a public `accessPath` or `contentUrl` for private templates, attachments, or rendered output. Return private output directly from the authenticated Route with `Cache-Control: private, no-store`; if persistence is required, add a protected download Route or an explicitly expiring signed URL with its access decision documented. A private disk or a hard-to-guess URL is not sufficient.

## Downloads and execution

Return the correct format MIME type and a safe `Content-Disposition` with UTF-8 `filename*` plus a fallback name. The client should request binary output, distinguish JSON errors from a document, respect response filenames, and release object URLs after use. Use explicit timezone consistently in both query-variable resolution and render formatting. NocoBase `ApiClient.request()` reads the response as text and parses JSON or plain text; `ApiClient.stream()` sends `Accept: text/event-stream`. Neither is a binary download API. Add a binary-capable helper that uses the App's configured API base URL, credentials, and auth headers, reads `response.blob()` or `arrayBuffer()`, and surfaces structured JSON errors before saving the file. A direct same-origin `fetch('/api/...')` is valid only when the App uses that origin as its API host.

For PDF, verify a compatible converter, fonts, writable temporary space, timeout, concurrency limit, and cleanup in the deployed environment. Keep conversion in a bounded worker when it is expensive; a timed-out HTTP request alone does not stop a converter process. Log template/revision IDs, counts, duration, and error stage, not full business records or signed URLs.
