# @nocobase/app-plugin-files

`FileService` is the public application service for managed Files. Applications
create one App-scoped `FilesRuntime`, mount the capability-protected Core route,
and explicitly mount each business-scoped `createFileRoute()` facade where the
business record's authorization is available.

The browser lifecycle is the same for Local and S3-compatible storage:

```text
POST scoped route -> PUT upload -> POST complete -> GET/HEAD content
                              \-> DELETE upload (best-effort cancel)
```

The scoped route also lists attached files and detaches them with `DELETE
/:fileId`. It never exposes a generic `/api/upload`, public `/uploads` directory,
or separate commit/access protocol.

## Server setup

A compact relation setup is:

```ts
export default defineMigration({
  name: 'create_purchase_order_attachments',
  async up({ builder }) {
    await builder.createCollection('purchaseOrderAttachments', (collection) => {
      collection.string('id', { length: 64 }).notNull().primary();
      collection.string('purchaseOrderId', { length: 64 }).notNull();
      collection.string('fileId', { length: 64 }).notNull();
      collection.integer('slot').notNull();
      collection.datetime('reservationExpiresAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['purchaseOrderId', 'slot']);
      collection.unique(['purchaseOrderId', 'fileId']);
      collection.foreignKey('purchaseOrderId', {
        references: { collection: 'purchaseOrders', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.foreignKey('fileId', {
        references: { collection: 'files', fields: ['id'] },
        onDelete: 'restrict',
      });
    });
  },
});

const filesRuntime = createFilesRuntime({
  database,
  config,
  audience,
  secret,
  basePath: '/api/files',
});
const fileService = createFileService({
  runtime: filesRuntime,
  publicBasePath: appPublicBasePath,
});

publicRoutes.route('/files', createCoreFilesRoute(filesRuntime));
protectedRoutes.route(
  '/orders/:orderId/files',
  fileService.createFileRoute({
    binding: {
      type: 'relation',
      collection: 'purchaseOrderAttachments',
      recordParam: 'orderId',
      recordField: 'purchaseOrderId',
      maxFiles: 10,
    },
    authorize: ({ action, recordId, fileId }) =>
      authorizeOrderFile({ action, orderId: recordId, fileId }),
  }),
);
```

Both subroutes are mounted inside the App API composition root, so their local
mount paths do not include `/api`. Mount the Core route at `/files` on the
public/capability boundary; its signed capabilities are the authorization
mechanism. Mount business-scoped routes on the session-protected boundary.
Create both routes and the `FileService` from the same `filesRuntime`.
`authorize` must enforce business record existence and read/write/share
permission. Foreign keys enforce referential integrity.

`createFileRoute()` validates static option shapes synchronously and starts an
asynchronous query check for the configured collection and required fields.
Every scoped request waits for that check before authorization or handler code
runs. The current database API does not expose portable column-type
introspection, so exact type compatibility and custom physical name mappings
remain migration responsibilities in Files V1.

## Default client page

Enabling the plugin contributes one lazy authenticated route at `/files`. Its
stable ID is `FILES_ROUTE_IDS.index` (`@nocobase/app-plugin-files:index`). The
plugin-owned default page is a small capability/status page built from the
plugin's own UI primitives, so the plugin remains usable without Registry
source. It is intentionally not a global file manager.

Applications may replace only this route's component by installing `page-ui`.
The route path, ID, authentication metadata, and fallback page remain owned by
the plugin.

## Files Registry UI

The plugin publishes exactly three application-owned Registry items. They are
separate from the plugin's default `/files` page and use the consuming
application's `@/components/ui/*` source.

| Item           | Installed target                                | Integration                                            |
| -------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `page-ui`      | `client/extensions/nocobase-files-page-ui`      | Overrides only `FILES_ROUTE_IDS.index`                 |
| `component-ui` | `client/extensions/nocobase-files-component-ui` | Direct import of V3 upload and preview components      |
| `provider-ui`  | `client/extensions/nocobase-files-provider-ui`  | Context, Provider, hook, and App-local client defaults |

Build all three items or one item at a time:

```bash
pnpm registry build --package @nocobase/app-plugin-files
pnpm registry build \
  --package @nocobase/app-plugin-files \
  --item component-ui
```

Repository-local materialization copies canonical source directly. Install the
Provider with the component or page item because both import its stable
application target.

```bash
pnpm registry materialize \
  --package @nocobase/app-plugin-files \
  --item provider-ui \
  --output-root /path/to/app
pnpm registry materialize \
  --package @nocobase/app-plugin-files \
  --item component-ui \
  --output-root /path/to/app
pnpm registry materialize \
  --package @nocobase/app-plugin-files \
  --item page-ui \
  --output-root /path/to/app
```

For remote shadcn installation, configure the Registry host in the consuming
application's `components.json` before using the namespaced dependencies:

```json
{
  "registries": {
    "@nocobase-files": "https://registry.example.com/files/r/{name}.json"
  }
}
```

`FileUploadField` keeps `StoredFile[]` as its controlled value in single and
multiple modes. It preserves progress, cancel, retry, replace, preview,
download, detach, and read-only behavior. When rendered inside a form,
`required`, `minimum`, active or failed uploads, `maxFiles`, `maxBytes`, and
`accept` violations block submission and expose an accessible validation
message. The Scoped Files Route remains authoritative for server-side policy
and authorization.

Installed source belongs to the application. Upgrade it with a three-way merge
instead of overwriting application changes.

## Expired upload cleanup

The plugin bootstrap registers one Queue schedule against the same
`FilesRuntime` and Storage instance used by `FileService`. Every five minutes it
selects at most 100 expired pending uploads or relation reservations and spends
at most five seconds on one run. Claims and reservation releases use
compare-and-set conditions, so ready files, renewed reservations, and uploads
that complete during selection are skipped.

Temporary object deletion is best-effort. A failed delete leaves the file in a
retryable failed state and a later run converges; completed cleanup is
idempotent. Operators can tune the scheduling infrastructure, but Files V1 does
not expose cleanup, repository, Storage, capability codec, complete, or purge
internals as public package APIs.

## V1 limits

Files V1 uses logical collection and field names with the QueryAdapter's
default naming normalization. It does not promise custom `tableName`,
`columnName`, or `tablePrefix` mappings. It also does not provide a full file
manager, automatic Registry upgrades, or a Registry/CDN publishing service.
