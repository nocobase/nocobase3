# Quick start

This is the shortest end-to-end path for adding attachments to a business
module. The [data model guide](data-model.md) explains the table contract, and
the [Route API guide](route-api.md) lists the fixed HTTP surface and access
rules.

## 1. Confirm the host context

Enable `@nocobase/app-plugin-file` in the application. The business plugin
resolves the existing database, Drive, authentication, and authorization
services from the Application's shared container. Read host configuration
through `config.get(appConfig)`, `config.get(driveConfig)`, and
`config.get(sessionConfig)`.

Use these public imports in the business plugin:

| Capability                                   | Package                               |
| -------------------------------------------- | ------------------------------------- |
| `databaseManagerToken`                       | `@nocobase/app-database`              |
| `authenticationToken`, `AuthEnv`             | `@nocobase/app-plugin-authentication` |
| `authorizationToken`, `AuthorizationEnv`     | `@nocobase/app-plugin-authorization`  |
| `createFileRoute`, `FileRouteAuthorizer`     | `@nocobase/app-plugin-file/server`    |
| `appConfig`                                  | `@nocobase/app-server-kit/config`     |
| `driveConfig`, `driveManagerToken`           | `@nocobase/app-server-kit/drive`      |
| `AppPluginApplication`                       | `@nocobase/app-server-kit/plugins`    |
| `defineApiRoutes`, `AppApiRouteContribution` | `@nocobase/app-server-kit/router`     |
| `sessionConfig`                              | `@nocobase/app-server-kit/session`    |
| `Hono`, `MiddlewareHandler`                  | `hono`                                |

Put the Route contribution in the business plugin's `server/routes/index.ts`.
Its default export is the `routes` array that `server/plugin.ts` passes to
`defineServerPlugin(...)`. Omitting that import and property leaves the Route
unregistered.

Do not add another file service, dependency injection mechanism, or a second
DatabaseManager/Drive manager. Registry installation does not install
this server code or a migration.

## 2. Create the migration

Create the business table and a separate standard file table. A one-to-many
table uses an indexed owner key; a one-to-one table uses a unique owner key.
Declare every field, relation, index, and constraint directly in the migration;
see [data model](data-model.md).

Use a reverse-order `down` migration. Register the logical inverse relation on
the business table with `hasMany('attachments', 'purchaseOrderAttachments')`.

## 3. Create a scoped Route

Keep the table name in server code and derive the owner from a validated Route
parameter. This is a key assembly fragment, not a standalone module; adapt its
table, resource, authorization callback, visibility, and limits:

```ts
type Env = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ config, container }) => {
    const router = new Hono();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const app = config.get(appConfig);
    const drive = config.get(driveConfig);
    const session = config.get(sessionConfig);
    const authenticate =
      authentication.required() as unknown as MiddlewareHandler<Env>;
    const resolveAuthorization =
      authorization.middleware() as unknown as MiddlewareHandler<Env>;
    const requireManagement: MiddlewareHandler<Env> = (context, next) =>
      authenticate(context, async () => {
        await resolveAuthorization(context, next);
      });

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
        limits: {
          maxSize: 50 * 1024 * 1024,
          maxFiles: 10,
          mimeTypes: ['application/pdf'],
        },
      }),
    );
    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
```

Import the service tokens, config definitions, `AppPluginApplication`,
`defineApiRoutes`, Hono, and the `AuthEnv`/`AuthorizationEnv` types from their
owning packages. Define `Env` as the intersection of their `Variables` types.
The inner Hono path omits the `/api` prefix added by the Application.

The authorization callback is business-specific. Its essential shape is:

```ts
const authorizePurchaseOrderFile: FileRouteAuthorizer = async (
  context,
  action,
) => {
  const authz = Reflect.get(
    context.var,
    'authz',
  ) as AuthorizationEnv['Variables']['authz'];
  const decision = await authz.authorize({
    resource: {
      type: 'purchase-order',
      id: context.req.param('orderId'),
    },
    action:
      action === 'upload' ? 'update' : action === 'delete' ? 'delete' : 'read',
  });
  if (decision.effect !== 'permit') {
    return context.json({ code: 'FORBIDDEN' }, 403);
  }
};
```

`maxFiles` serializes checks for the same owner within one Route instance and
process. Concurrent requests on multiple application nodes can still exceed
it without a database constraint or distributed mechanism. Use a database
UNIQUE owner constraint when the relation must be one-to-one. When `maxSize`
is omitted, the Route defaults to 50 MiB per file.

The authorization callback must call the existing business authorization
system and deliberately map every `FileRouteAction`. It must not introduce a
second file ACL. The Route has six fixed endpoints; see
[route-api](route-api.md).

## 4. Connect the client

The following is the client integration fragment; `orderId`, `attachments`,
and form state belong to the business module:

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
/>;
```

The business form owns the relation and submission state; treat `uploading`
and `error` as submission blockers. Registry UI does not install the server
Route or migration.

## 5. Validate

Run the migration and focused business tests for allowed and denied
authorization, scope isolation, Public access, Private Token access, MIME and
size limits, deletion, and the relation's database constraint.
