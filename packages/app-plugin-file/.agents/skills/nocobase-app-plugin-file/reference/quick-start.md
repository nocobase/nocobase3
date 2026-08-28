# Quick start

This is the shortest end-to-end path for adding attachments to a business
module. The [data model guide](data-model.md) explains the table contract, and
the [Route API guide](route-api.md) lists the fixed HTTP surface and access
rules.

## 1. Confirm the host context

Enable `@nocobase/app-plugin-file` in the application. In the server plugin
context, confirm the existing `deps.database`, `deps.driveManager`, `deps.auth`,
and `deps.authz` dependencies are available. The plugin context must also
provide `config.app.publicBasePath`, `config.drive.default`, and
`config.session.secret`.

Import the public Route factory:

```ts
import { createFileRoute } from '@nocobase/app-plugin-file/server';

export default function registerPurchaseOrderFiles({
  app,
  config,
  deps,
}: PurchaseOrderPluginRoutesContext): void {
  // Continue with the migration and Route below.
}
```

`PurchaseOrderPluginRoutesContext` is the business module's existing typed
plugin context. Do not widen it or expose DatabaseManager to browser code.

Do not add `AppServices.files`, another dependency injection mechanism, or a
second DatabaseManager/Drive manager. Registry installation does not install
this server code or a migration.

## 2. Create the migration

Create the business table and a separate standard file table. A one-to-many
table uses an indexed owner key; use the [one-to-one recipe](recipes/one-to-one.md)
for a unique owner key. The essential migration fragment is:

```ts
await builder.createCollection('purchaseOrderAttachments', (table) => {
  table.string('id', { length: 64 }).notNull();
  table.string('disk', { length: 64 }).notNull();
  table.string('key', { length: 512 }).notNull();
  table.string('filename', { length: 255 }).notNull();
  table.string('mimeType', { length: 255 }).notNull();
  table.bigInt('size').notNull();
  table.boolean('public').notNull().defaultTo(false);
  table.datetime('createdAt').notNull();
  table.datetime('updatedAt').notNull();
  table
    .belongsTo('order', 'purchaseOrders')
    .foreignKey('orderId')
    .foreignKeyType('integer')
    .constraints(true)
    .index();
  table.primary('id', { name: 'pk_purchase_order_attachments' });
  table.unique(['disk', 'key'], {
    name: 'uq_purchase_order_attachment_object',
  });
});
```

Use a reverse-order `down` migration. Register the logical inverse relation on
the business table with `hasMany('attachments', 'purchaseOrderAttachments')`.
See [data-model](data-model.md) for all fields and constraints.

## 3. Create a scoped Route

Keep the table name in server code and derive the owner from the Route
parameter. Validate the parameter before returning a scope:

```ts
app.route(
  '/api/purchase-orders/:orderId/attachments',
  createFileRoute({
    database: deps.database,
    table: 'purchaseOrderAttachments',
    scope: (context) => {
      const raw = context.req.param('orderId');
      const orderId = Number(raw);
      if (!raw || !Number.isSafeInteger(orderId) || orderId < 1) {
        throw new TypeError('A valid orderId is required.');
      }
      return { orderId };
    },
    drive: deps.driveManager,
    defaultDisk: config.drive.default,
    publicBasePath: config.app.publicBasePath,
    tokenSecret: config.session.secret,
    audience: 'purchase-order-attachments',
    auth: deps.auth.required(),
    authorize: authorizePurchaseOrderFile,
    visibility: { default: 'private', allowClientOverride: false },
    limits: { maxSize: 50 * 1024 * 1024, maxFiles: 10 },
  }),
);
```

`maxFiles` serializes checks for the same owner within one Route instance and
process. Concurrent requests on multiple application nodes can still exceed
it without a database constraint or distributed mechanism. Use a database
UNIQUE owner constraint when the relation must be one-to-one. When `maxSize`
is omitted, the Route defaults to 50 MiB per file.

`authorizePurchaseOrderFile` must call the existing authorization system for
the purchase order and action. It must not introduce a second file ACL. The
Route has six fixed endpoints; see [route-api](route-api.md).

## 4. Connect the client

```tsx
import { createFilesClient } from '@nocobase/app-plugin-file/client/files-client';
import { FileUploadField } from '@nocobase/app-plugin-file/client/components';

const client = createFilesClient({
  endpoint: `/api/purchase-orders/${orderId}/attachments`,
});

<FileUploadField
  client={client}
  value={attachments}
  onChange={setAttachments}
  multiple
  accept={['application/pdf']}
  maxFiles={10}
  onStatusChange={setAttachmentUploadStatus}
/>;
```

The business form submits the relation and owner ID. The client handles the
plugin endpoint, same-origin base path, multipart upload, authentication, and
content URL flow. Each upload can be cancelled and pending requests are
aborted when the field unmounts. Treat `uploading` and `error` status as form
submission blockers. File UI accepts only relative or HTTP(S) content and
access URLs; unsafe schemes such as `javascript:` and external `data:` are not
rendered or fetched. Use `FilePreviewField` for compact read-only thumbnails,
optionally with `showFilenames`, and `FilePreviewDialog` with `files` plus
`initialIndex` for multi-file preview and keyboard navigation. Markdown uses
safe GFM rendering without raw HTML. Office and OpenDocument files use Office
Online only for internet-accessible absolute HTTP(S) Public URLs or freshly
issued Private access URLs; relative, localhost, blob, and failed embeds fall
back to download. The runtime Demo works without Registry; install
`component-ui` only when the application needs editable UI source. Install
`page-ui` when the application should own and customize the Demo page. The two
Registry items are independently installable; `page-ui` composes the plugin's
stable public client exports.

The built-in Demo management endpoints and page require the existing
`system-administrator` Permission Set. This Demo policy does not alter the
generic `createFileRoute()` authorization contract or Public/Private content
access.

## 5. Validate

Run the migration and focused business tests, including allowed/denied
authorization, scope isolation, Public access, Private Token access, MIME and
size limits, and deletion. Then run the package checks:

```bash
pnpm --filter @nocobase/app-plugin-file lint
pnpm --filter @nocobase/app-plugin-file format:check
pnpm --filter @nocobase/app-plugin-file typecheck
pnpm --filter @nocobase/app-plugin-file test
pnpm --filter @nocobase/app-plugin-file build
```

For a complete small implementation, compare the [one-to-many recipe](recipes/one-to-many.md)
or [one-to-one recipe](recipes/one-to-one.md).
