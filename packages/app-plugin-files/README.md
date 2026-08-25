# @nocobase/app-plugin-files

`createFileRoute()` accepts logical collection and field names. Files V1 relies
only on the QueryAdapter's default naming normalization. It does not read
Collection metadata mappings and does not support or promise custom
`tableName`, `columnName`, or `tablePrefix` mappings:

```ts
const route = fileService.createFileRoute({
  binding: {
    type: 'relation',
    collection: 'purchaseOrderAttachments',
    parentCollection: 'purchaseOrders',
    recordParam: 'purchaseOrderId',
    recordField: 'purchaseOrderId',
    maxFiles: 10,
  },
  authorize,
});
```

Business migrations and database constraints remain responsible for the
binding schema. A relation binding names its parent collection explicitly;
`parentField` defaults to `id`.

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
