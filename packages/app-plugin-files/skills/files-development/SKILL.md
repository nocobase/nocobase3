---
name: files-development
description: Add file fields and attachment APIs to NocoBase 3 business modules using @nocobase/app-plugin-files, including standard schemas, one-to-one or one-to-many relations, createFileRoute, public files, expiring tokens, and copyable Registry UI.
metadata:
  short-description: Add file fields and attachment APIs to NocoBase 3 modules
---

# Files development

Use this Skill when a business module needs one-to-one or one-to-many file
attachments. The module owns its tables, business Route, relation/form
submission, and authorization. The files plugin supplies the stable storage,
access, Route, client, and UI contracts.

Read the focused guides as needed: [quick start](../../docs/quick-start.md),
[data model](../../docs/data-model.md), [Route API](../../docs/route-api.md),
[security](../../docs/security.md), [one-to-one recipe](../../docs/recipes/one-to-one.md),
and [one-to-many recipe](../../docs/recipes/one-to-many.md). For business
authorization, also read the [authorization development
Skill](../../../authorization/skills/authorization-development/SKILL.md).

## 1. Confirm prerequisites

- Confirm `@nocobase/app-plugin-files` is installed and enabled.
- In the server plugin context, confirm the existing dependencies expose
  `deps.database`, `deps.driveManager`, `deps.auth`, and `deps.authz` (or the
  application's equivalent existing authentication and authorization APIs).
- Identify the business Route and its existing authorization resource/action.
- Create a local service with `createFilesService()`. Do not add
  `AppServices.files`, a Service Registry, a mutable DI container, or a second
  database/Drive connection.

```ts
const files = createFilesService({
  database: deps.database,
  drive: deps.driveManager,
  publicBasePath: config.app.publicBasePath,
  defaultDisk: config.drive.default,
  tokenSecret: config.session.secret,
});
```

`FilesService` keeps the raw DatabaseManager and Drive manager private. A
missing dependency must produce a clear unavailable error when the service is
used; it must not silently create a replacement connection.

## 2. Choose the relation shape

- **One-to-one:** use a separate standard file table with one owner foreign
  key, a unique constraint on that owner key, and a Route limit of `maxFiles: 1`.
- **One-to-many:** use a separate standard file table with an indexed owner
  foreign key and a Route limit that matches the business rule.
- A global `files` table is optional. It is not required for either shape.

Use logical relation names such as `avatar` and `attachments`; keep storage
metadata in the file table and business ownership in the relation key.

## 3. Use the standard file fields

Every standard file table contains `id`, `disk`, `key`, `filename`, `mimeType`,
`size`, `public`, `createdAt`, and `updatedAt`. Add `PRIMARY KEY (id)` and
`UNIQUE (disk, key)`. Use an explicit `belongsTo` relation with a physical
foreign-key field and `constraints(true)`; use `hasOne` or `hasMany` for the
inverse logical relation. Add an owner index, and a unique owner constraint
for one-to-one.

Store stable metadata only. Never persist a final URL or access Token: URLs
depend on the current app base path and private URLs expire.

## 4. Create the Store safely

Create the standard Store from the local service with a hard-coded table name.
Resolve scope only from a validated server Route parameter:

```ts
const orderAttachments = files.createDatabaseStore({
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
});
```

The table and scope field names are server-owned constants. Never accept a
table, scope name, disk, key, or ID from client body/query data. Use a custom
`FileStore` only when the business schema is intentionally different from the
standard shape; keep that adapter narrow and scoped.

## 5. Register the file Route

Mount `createFileRoute()` below the business API path and configure limits and
visibility from server code:

```ts
const route = createFileRoute({
  files,
  store: orderAttachments,
  audience: 'purchase-order-attachments',
  auth: deps.auth.required(),
  authorize: authorizePurchaseOrderFile,
  visibility: { default: 'private', allowClientOverride: false },
  limits: {
    maxSize: 50 * 1024 * 1024,
    maxFiles: 10,
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
});

app.route('/api/purchase-orders/:orderId/attachments', route);
```

`FileRouteAction` values mean: `list` lists the scoped records, `upload`
creates an object and record, `read` returns metadata, `issue-token` creates a
short-lived private content URL, and `delete` removes the record and object.
The content GET is intentionally not a `FileRouteAction`: Public access or a
valid Token authorizes it after the record is looked up.

The `auth` middleware protects list, upload, metadata, Token issuance, and
delete. The optional `authorize` callback is the business permission hook;
reuse the application's existing authorization resource, action, identity, and
record conditions. Do not create a file-specific ACL model.

## 6. Public and Private access

Route visibility defaults to Private. A client may submit `public=true|false`
only when the Route explicitly sets `allowClientOverride: true`; otherwise
visibility is server-owned. Public content still looks up the database record
on every request, so deletion or changing `public` revokes the old URL.

Private content requires the Token URL returned by `issue-token`. Tokens are
short-lived, audience-bound, file-bound, and valid only for content GET. They
do not authorize listing, uploading, deleting, or issuing another Token. Never
turn Public into an infinite Token and never log Token values.

## 7. Use the UI contracts

The plugin runtime Demo is available without Registry installation. If the
business UI needs source-level customization, install the `component-ui`
Registry item. Install `page-ui` only when the application should own the Demo
page override. Registry source is application-owned UI; it does
not install server code or migrations and must not contain database, Drive,
Token, or security logic.

```ts
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
/>
```

The business form owns relation submission and persistence of the owner ID.
Use the plugin client and components; do not call legacy storage action names
or let UI code manage Tokens or storage paths.

## 8. Delete and validate

Version 1 deletes the database record and storage object. It does not assume
soft delete, versions, reference counting, folders, or a recycle bin. Test the
business boundary with focused allowed and denied cases, including:

- upload and delete allowed for the intended role;
- list, metadata, and content denied outside the owner scope;
- Public content works without a Token but still fails after record removal;
- Private content fails without a Token and succeeds with a valid Token;
- expired, altered, wrong-audience, and wrong-file Tokens fail;
- MIME, size, and maximum-file validation happens before storage writes.

## Completion checklist

- [ ] Plugin is enabled and the existing server dependencies are available.
- [ ] The relation and database constraints match one-to-one or one-to-many.
- [ ] All standard fields, `(disk, key)` uniqueness, and owner constraints are present.
- [ ] Store table and scope are server constants; IDs are validated.
- [ ] Local `createFilesService()` and `createFileRoute()` use existing host dependencies.
- [ ] Existing authorization protects every management action.
- [ ] Visibility, MIME, size, and count policies are server-owned and tested.
- [ ] Client/UI uses `createFilesClient` and `FileUploadField`; the business form owns relations.
- [ ] Public/Private, Token, deletion, and denial tests pass.

Do not add the discarded upload-intent/complete architecture, a generic
service registry, direct storage-driver calls from business modules, or the
legacy `storages:*` protocol. Do not edit `app-server-kit` to make a business
module fit; use the existing `AppDeps.database` host capability.
