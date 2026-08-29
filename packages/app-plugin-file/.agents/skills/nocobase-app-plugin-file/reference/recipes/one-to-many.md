# Recipe: one-to-many order attachments

This recipe attaches up to ten PDF, Word, or Excel files to a purchase order.
The owner key is indexed but not unique. For a single avatar, use the
[one-to-one recipe](one-to-one.md).

## Migration fragment

Create the owner table first and the standard attachment table second:

```ts
await builder.createCollection('purchaseOrders', (table) => {
  table.increments('id');
  table.string('number', { length: 64 }).notNull();
  table.datetime('createdAt').notNull();
  table
    .hasMany('attachments', 'purchaseOrderAttachments')
    .foreignKey('orderId');
});

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

Drop `purchaseOrderAttachments` before `purchaseOrders` in the reverse
migration order. The explicit foreign-key constraint prevents orphaned file
records.

## Store and Route

```ts
import { createFileRoute } from '@nocobase/app-plugin-file/server';
import type { MiddlewareHandler } from 'hono';

const allowedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

const requireAuth = app.container.resolve(authenticationToken).required();
const resolveAuthorization = app.container
  .resolve(authorizationToken)
  .middleware();
const managementAuth: MiddlewareHandler = (context, next) =>
  requireAuth(context, async () => {
    await resolveAuthorization(context, next);
  });

app.route(
  '/api/purchase-orders/:orderId/attachments',
  createFileRoute({
    database: app.container.resolve(databaseManagerToken),
    table: 'purchaseOrderAttachments',
    scope: (context) => {
      const raw = context.req.param('orderId');
      const orderId = Number(raw);
      if (!raw || !Number.isSafeInteger(orderId) || orderId < 1) {
        throw new TypeError('A valid orderId is required.');
      }
      return { orderId };
    },
    order: { field: 'createdAt', direction: 'desc' },
    drive: app.container.resolve(driveManagerToken),
    defaultDisk: config.drive.default,
    publicBasePath: config.app.publicBasePath,
    tokenSecret: config.session.secret,
    audience: 'purchase-order-attachments',
    auth: managementAuth,
    authorize: async (context, action) => {
      const orderId = context.req.param('orderId');
      const decision = await context.get('authz').authorize({
        resource: { type: 'purchase-order', id: orderId },
        action:
          action === 'upload'
            ? 'update'
            : action === 'delete'
              ? 'delete'
              : 'read',
      });
      if (decision.effect !== 'permit') {
        return context.json({ code: 'FORBIDDEN' }, 403);
      }
    },
    visibility: { default: 'private', allowClientOverride: false },
    limits: {
      maxSize: 50 * 1024 * 1024,
      maxFiles: 10,
      mimeTypes: allowedMimeTypes,
    },
  }),
);
```

`maxFiles: 10` serializes uploads for the same owner within one process and
Route instance. Simultaneous uploads on multiple application nodes can still
exceed it without a database constraint or distributed mechanism.

The composed middleware resolves the existing authorization identity for
management operations only; it does not make Public or valid-Token content
depend on an active session.

Map every `FileRouteAction` deliberately in the hook. If the module exposes a
database collection, register it with the existing authorization system and
apply conditional record/field constraints in the business query adapter. Do
not make the file Store an authorization implementation. For the purchase
order requirement, grant the mapped `update` and `delete` actions to purchasers
and the mapped `read` action to approvers through existing Permission Sets;
keep record scope rules on the purchase-order resource.

## Client setup

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
  accept={[...allowedMimeTypes]}
  maxSize={50 * 1024 * 1024}
  maxFiles={10}
/>;
```

The purchase-order form owns the order relation and saves the attachment IDs
according to its business model. The UI does not call storage action names or
persist content URLs/Tokens. Private preview requests a short-lived content
URL through `FilesClient.createAccessUrl()`.

## Acceptance tests

Cover both the HTTP boundary and the database relation:

```ts
it('allows an approver to list and download order files', async () => {
  const list = await app.request('/api/purchase-orders/1001/attachments');
  expect(list.status).toBe(200);

  const token = await app.request(
    '/api/purchase-orders/1001/attachments/file-1/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: 300 }),
    },
  );
  expect(token.status).toBe(200);
});

it('denies upload to a view-only user', async () => {
  const response = await viewerApp.request(
    '/api/purchase-orders/1001/attachments',
    {
      method: 'POST',
      body: multipartFile('contract.pdf', 'application/pdf'),
    },
  );
  expect(response.status).toBe(403);
});

it('rejects an eleventh file and compensates its object write', async () => {
  seedOrderFiles(10);
  const response = await app.request('/api/purchase-orders/1001/attachments', {
    method: 'POST',
    body: multipartFile('extra.pdf', 'application/pdf'),
  });
  expect(response.status).toBe(400);
  expect(fakeDrive.delete).toHaveBeenCalledWith(expect.any(String));
});
```

Also test MIME and size rejection, scoped list/find/delete, a valid Private
Token stream, expired/altered/wrong-audience/wrong-file Tokens, Public content
without a Token, and deletion of the Drive object plus record. Test that two
attachments for one order succeed while the same `(disk, key)` pair fails.
