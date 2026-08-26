# @nocobase/app-plugin-files

Files V1 uses logical collection and field names with the QueryAdapter's
default naming normalization. It does not promise custom `tableName`,
`columnName`, or `tablePrefix` mappings. A compact relation setup is:

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

## File upload Registry

The plugin owns the `file-upload` Registry recipe under `registry/file-upload`.
The Default Template does not preinstall this UI. Materialize the recipe into an
application only when that application needs Files fields, then treat the
installed source as application-owned code.

```bash
pnpm registry build --package @nocobase/app-plugin-files
pnpm registry materialize \
  --package @nocobase/app-plugin-files \
  --item file-upload \
  --output-root /path/to/app
```
