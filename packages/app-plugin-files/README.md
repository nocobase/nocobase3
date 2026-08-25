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

const runtime = createFilesRuntime({
  database,
  config,
  audience,
  secret,
  basePath: '/api/files',
});
const fileService = requireFileService(services.fileService);
const route = fileService.createFileRoute({
  binding: {
    type: 'relation',
    collection: 'purchaseOrderAttachments',
    recordParam: 'orderId',
    recordField: 'purchaseOrderId',
    maxFiles: 10,
  },
  authorize: ({ action, recordId, fileId }) =>
    authorizeOrderFile({ action, orderId: recordId, fileId }),
});
protectedRoutes.route('/api/files', createCoreFilesRoute(runtime));
protectedRoutes.route('/api/orders/:orderId/files', route);

function requireFileService(service: FileService | undefined): FileService {
  if (!service)
    throw new Error('The Files plugin is required by order routes.');
  return service;
}
```

Create the optional service with `createFileService({ runtime,
publicBasePath: appPublicBasePath })`; `appPublicBasePath` prefixes the mounted
`/api/...` routes while the runtime `basePath` points at the resulting core
Files URL. `authorize` must enforce business record existence and read/write/
share permission. Foreign keys enforce referential integrity.

## File upload Registry

The plugin owns the `file-upload` Registry recipe under `registry/file-upload`.
The Default Template keeps a materialized snapshot in
`client/extensions/nocobase-file-upload` so applications can edit it directly.

```bash
pnpm registry build --package @nocobase/app-plugin-files
pnpm registry materialize \
  --package @nocobase/app-plugin-files \
  --item file-upload \
  --output-root /path/to/app
```
