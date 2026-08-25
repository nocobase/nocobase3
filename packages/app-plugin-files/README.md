# @nocobase/app-plugin-files

`createFileRoute()` validates Collection fields, foreign keys, and physical
names from the current process's Collection metadata. Define metadata recovery
inside the same business migration so the migration runner restores it after a
restart without rerunning schema or data changes:

```ts
export default defineMigration({
  async up({ builder }) {
    await builder.createCollection(
      'purchaseOrders',
      definePurchaseOrdersCollection,
    );
  },
  async restoreMetadata({ builder }) {
    await builder.registerCollectionMetadata(
      'purchaseOrders',
      definePurchaseOrdersCollection,
    );
  },
  // ...
});

const route = fileService.createFileRoute(/* ... */);
```

Run migrations explicitly during deployment, then start the application
normally. Startup restores `restoreMetadata()` for applied migrations even
when migration auto-run is disabled. Metadata recovery does not execute DDL or
make a missing database table valid, so route creation continues to fail fast
on invalid definitions.

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
