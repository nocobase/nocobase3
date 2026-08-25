# @nocobase/app-plugin-files

`createFileRoute()` accepts logical Collection and field names. The existing
Database QueryAdapter applies the configured naming strategy, so route setup
does not depend on in-memory Collection metadata:

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
binding schema. A relation binding names its parent Collection explicitly;
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
