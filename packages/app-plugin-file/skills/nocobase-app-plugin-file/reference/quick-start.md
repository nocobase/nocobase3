# Quick start

This is the shortest end-to-end path for adding attachments to a business
module. The [data model guide](data-model.md) explains the table contract, and
the [Route API guide](route-api.md) lists the fixed HTTP surface and access
rules.

All code below is a partial example. Follow the current application template
for ordinary plugin structure and imports; this guide only calls out file
integration decisions that are easy to get wrong.

## 1. Confirm the host context

Enable `@nocobase/app-plugin-file` in the application. The business plugin
resolves the existing database, Drive, authentication, and authorization
services from the Application's shared container. Read `appConfig` and
`driveConfig` with `config.get(...)`. For private-token signing, use the
effective secret from `container.resolve(sessionManagerToken).config.secret`,
not the optional raw `sessionConfig.secret` value.

Put the Route contribution in the business plugin's `server/routes/index.ts`.
Its default export is the `routes` array that `server/plugin.ts` passes to
`defineServerPlugin(...)`. Omitting that import and property leaves the Route
unregistered.

Do not add another file service, dependency injection mechanism, or a second
DatabaseManager/Drive manager. Registry installation does not install
this server code or a migration.

## 2. Create the migration

For a new module, create the business table and a separate standard file table.
For an existing business table, alter it to add the inverse relation and create
only the file table. A one-to-many table uses an indexed owner key; a one-to-one
table uses a unique owner key. Declare every field, relation, index, and
constraint directly in the migration; see [data model](data-model.md).

Use a reverse-order `down` migration. Register the logical inverse relation on
the business table with `hasMany('attachments', 'purchaseOrderAttachments')`.

## 3. Create a scoped Route

Keep the table name in server code and derive the owner from a validated Route
parameter. This is an assembly fragment, not a standalone module:

```ts
export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ config, container }) => {
    const router = new Hono();
    const app = config.get(appConfig);
    const drive = config.get(driveConfig);
    const session = container.resolve(sessionManagerToken).config;

    router.route(
      '/purchase-orders/:orderId/attachments',
      createFileRoute({
        database: container.resolve(databaseManagerToken),
        table: 'purchaseOrderAttachments',
        scope: (context) => {
          const orderId = Number(context.req.param('orderId'));
          if (!Number.isSafeInteger(orderId) || orderId < 1) {
            throw new TypeError('A valid orderId is required.');
          }
          return { orderId };
        },
        drive: container.resolve(driveManagerToken),
        defaultDisk: drive.default,
        publicBasePath: app.publicBasePath,
        tokenSecret: session.secret,
        audience: 'purchase-order-attachments',
        auth: requireManagement,
        authorize: authorizePurchaseOrderFile,
        visibility: { default: 'private', allowClientOverride: false },
        limits: { maxFiles: 10, mimeTypes: ['application/pdf'] },
      }),
    );
    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
```

Use the owning packages and the current application template for imports. The
inner Hono path omits the `/api` prefix added by the Application, and the
contribution must be included in the plugin's `routes` array passed to
`defineServerPlugin(...)`. Build `requireManagement` from the application's
existing authentication and authorization middleware.

The authorization callback must call the existing business authorization
boundary and deliberately map every `FileRouteAction`. Do not invent a second
file ACL or an unregistered resource type. If the parent uses database
authorization, check it through its authorized service/query and apply the
returned record conditions. Do not treat a `conditional` database decision as
a plain `permit`.

## 4. Connect the client

The following is the client integration fragment; `orderId`, `attachments`,
and form state belong to the business module. Persist the parent record first;
only then construct this client and enable uploads:

```tsx
const client = createFilesClient({
  endpoint: `/api/purchase-orders/${orderId}/attachments`,
});

<FileUploadField
  client={client}
  value={attachments}
  onChange={setAttachments}
  onStatusChange={setAttachmentUploadStatus}
  multiple
  accept={['application/pdf']}
  maxFiles={10}
  removeOnDelete
/>;
```

Initialize `attachments` from `await client.list()` in edit/read views. The
business form owns the relation and submission state; treat `uploading` and
`error` as submission blockers. `removeOnDelete` calls the server DELETE
endpoint; omit it only when the business workflow performs deletion itself.

## 5. Validate

Run the migration and focused business tests for allowed and denied
authorization, scope isolation, Public access, Private Token access, MIME and
size limits, deletion, and the relation's database constraint.
