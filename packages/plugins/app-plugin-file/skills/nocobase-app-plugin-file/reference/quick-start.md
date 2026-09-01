# Quick start for an application

This is the shortest App-owned path for adding attachments to a business
record. The [data model guide](data-model.md) defines the file-table contract,
and the [Route API guide](route-api.md) defines the stable HTTP surface.

The locations below follow applications such as `app-template-default`. Adapt
names to the target App's existing structure, but keep the ownership in the
application unless the user explicitly requests a reusable published plugin.

## 1. Inspect the target application

Before editing, confirm the App's composition roots and local instructions:

```text
database/migrations/    App-owned schema history
server/routes/index.ts  App-owned Server Route array
server/runtime.ts       Imports the App Route array
client/routes.ts        App-owned page contributions
client/pages/           App-owned pages and forms
client/locales/         App-owned user-facing text
tests/logic/ or e2e/    App behavior tests
```

Confirm `@nocobase/app-plugin-file` is installed and registered in the App. The
plugin registration supplies reusable public code and locale resources; it does
not create a business table, API endpoint, or page.

Do not create a new business plugin for this workflow. Do not edit the File
plugin's source or the App's synchronized `.agents/skills/` copy.

## 2. Add the App migration

Create the business relation in the application's `database/migrations/`
directory. For a new feature, create the parent collection and a separate
standard file collection. For an existing parent, alter it to add the inverse
relation and create only the file collection.

A one-to-many attachment collection uses an indexed owner key. A one-to-one
file field uses a unique owner key. Declare every field, relation, index, and
constraint directly in the migration; do not import a runtime collection
definition. Use a reverse-order `down` migration when the operation is
reversible.

For example, an App-owned `purchaseOrderAttachments` collection should contain
the standard fields from [data model](data-model.md), an indexed `orderId`, a
`belongsTo` relation to `purchaseOrders`, and `UNIQUE (disk, key)`. The parent
collection owns the inverse `hasMany('attachments',
'purchaseOrderAttachments')` relation.

## 3. Add the App Server Route

Create an application source file such as
`server/routes/purchase-order-attachments.ts`. Import only public package
entries:

```ts
import type { Application } from '@nocobase/app-server/application';
import { appConfig } from '@nocobase/app-server/config';
import { driveConfig, driveManagerToken } from '@nocobase/app-server/drive';
import { sessionManagerToken } from '@nocobase/app-server/session';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import {
  createFileRoute,
  type FileRouteAuthorizer,
} from '@nocobase/app-plugin-file/server';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type MiddlewareHandler } from 'hono';

type Env = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

const authorizePurchaseOrderFile: FileRouteAuthorizer = async (
  context,
  action,
  file,
) => {
  const orderId = Number(context.req.param('orderId'));
  return authorizePurchaseOrder(context, { orderId, action, file });
};

export const purchaseOrderAttachmentRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<Env>();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const drive = app.config.get(driveConfig);
    const appSettings = app.config.get(appConfig);
    const session = app.container.resolve(sessionManagerToken).config;
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
        database: app.container.resolve(databaseManagerToken),
        table: 'purchaseOrderAttachments',
        scope: (context) => {
          const orderId = Number(context.req.param('orderId'));
          if (!Number.isSafeInteger(orderId) || orderId < 1) {
            throw new TypeError('A valid orderId is required.');
          }
          return { orderId };
        },
        drive: app.container.resolve(driveManagerToken),
        defaultDisk: drive.default,
        publicBasePath: appSettings.publicBasePath,
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
```

`authorizePurchaseOrder()` above is application-owned domain code, not a File
plugin API. It must validate the parent record and map every
`FileRouteAction` to the App's existing authorization model. If authorization
returns record conditions, apply them while loading the parent; do not reduce a
conditional decision to a plain permit. Returning a denial Response or throwing
the App's standard authorization error must stop the file operation.

Pass the combined authentication and authorization middleware through
`createFileRoute()`'s `auth` option. The factory applies it to management
operations while preserving the content endpoint's Public or Private-token
decision. Do not put a wildcard login middleware around the whole child router;
that would incorrectly require a session for Public content and valid token
URLs. The same App Route contribution still owns and tests the complete
security boundary.

Import this contribution in the application's `server/routes/index.ts` and add
it to the existing routes array:

```ts
import { purchaseOrderAttachmentRoutes } from './purchase-order-attachments.js';

const routes = [
  // Existing App routes.
  purchaseOrderAttachmentRoutes,
];
```

Do not add `/api` to the child path; `defineApiRoutes()` supplies it. Do not
accept the table, scope field, disk, storage key, or token secret from the
browser.

## 4. Connect the App Client

In the owning application page or form, import the public Client API:

```tsx
import {
  createFilesClient,
  FileUploadField,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';

const client = createFilesClient({
  endpoint: `/api/purchase-orders/${orderId}/attachments`,
});

const [attachments, setAttachments] = useState<readonly FileRecord[]>([]);

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

Persist the parent record before constructing its scoped endpoint or enabling
uploads. Initialize edit and read views with `await client.list()`. Treat
`uploading` and `error` status as form-submission blockers. Use `FileList`,
`FilePreviewField`, or `FilePreviewDialog` in application-owned read views as
needed.

If the workflow needs a new page, default-export it from `client/pages/` and
add a lazy entry to the App's existing `client/routes.ts`. Do not add a Client
Route to the File plugin. Put application labels, validation messages, and page
copy in the App's `client/locales/`; the reusable File components keep their
own plugin namespace.

## 5. Validate the application workflow

Run the App migration and focused application tests. Cover:

- the physical file schema, relation, owner index or unique constraint, and
  `UNIQUE (disk, key)`;
- invalid owner IDs and cross-owner scope isolation;
- anonymous, authenticated-but-denied, and permitted management requests;
- Public content and Private token access, including expiry and wrong audience;
- MIME, size, and file-count limits;
- delete behavior and object cleanup;
- controlled Client upload state, reload with `client.list()`, and previews;
- the real App page-to-API workflow under its configured public base path.

Run the target application's focused lint, typecheck, tests, and build. Use
Client or Server inspectors only when Route or plugin composition changed or is
unexpectedly unavailable; inspectors do not prove behavior or security.
