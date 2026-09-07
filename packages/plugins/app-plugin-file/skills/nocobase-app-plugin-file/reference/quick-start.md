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
import { Hono } from 'hono';
import { every } from 'hono/combine';
import { HTTPException } from 'hono/http-exception';

type Env = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

function parseOrderId(value: string | undefined): number {
  const orderId = Number(value);
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    throw new HTTPException(400, { message: 'A valid orderId is required.' });
  }
  return orderId;
}

const authorizePurchaseOrderFile: FileRouteAuthorizer = async (
  context,
  action,
  file,
) => {
  const orderId = parseOrderId(context.req.param('orderId'));
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
    const requireManagement = every(
      authentication.required(),
      authorization.middleware(),
    );

    router.route(
      '/purchase-orders/:orderId/attachments',
      createFileRoute({
        database: app.container.resolve(databaseManagerToken),
        table: 'purchaseOrderAttachments',
        scope: (context) => ({
          orderId: parseOrderId(context.req.param('orderId')),
        }),
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
conditional decision to a plain permit. Return `false` to deny with
`FILE_FORBIDDEN` (403), or return a denial Response/throw the App's standard
error. `true` and `void` permit the operation; never leave a permissive stub.
For a conventional attachment field, map `list`, `read`, and `issue-token` to
parent read permission, and `upload`/`delete` to parent update permission.
Use the App's more specific policy when these operations have distinct grants.
Authentication alone and `{ orderId }` scope do not authorize the parent.

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
import { apiClientToken, useService } from '@nocobase/app-client';
import {
  createFilesClient,
  FileUploadField,
  type FileRecord,
  type FileUploadStatus,
} from '@nocobase/app-plugin-file/client';
import { useMemo, useState } from 'react';

const api = useService(apiClientToken);
const client = useMemo(
  () =>
    createFilesClient({
      api,
      endpoint: `purchase-orders/${encodeURIComponent(orderId)}/attachments`,
    }),
  [api, orderId],
);

const [attachments, setAttachments] = useState<readonly FileRecord[]>([]);
const [attachmentUploadStatus, setAttachmentUploadStatus] =
  useState<FileUploadStatus>('idle');

<FileUploadField
  key={orderId}
  client={client}
  value={attachments}
  onChange={setAttachments}
  onStatusChange={setAttachmentUploadStatus}
  multiple
  accept={['application/pdf']}
  maxFiles={10}
  removeOnDelete
/>;

// Include this condition in the owning form's submit-disabled logic.
const attachmentsPending = attachmentUploadStatus !== 'idle';
```

`endpoint` is relative to the v3 Application's `/api` root. Do not include
`/api`, the public base path, an origin, a query string, or a fragment. The
injected `ApiClient` owns Cookie authentication, deployment base paths, request
headers, and multipart transport.

Persist the parent record before constructing its scoped endpoint or enabling
uploads. Initialize edit and read views with `await client.list()` before
enabling edits or submission; surface load failures instead of treating them as
an empty list. Key the owning form by the saved owner ID so its controlled
values reset when navigating between records. Memoize the client as above;
changing it cancels the previous component upload session. Treat `uploading`
and `error` status as form-submission blockers. Use `FileList`,
`FilePreviewField`, or `FilePreviewDialog` in application-owned read views as
needed.

If the workflow needs a new page, default-export it from `client/pages/` and
add a lazy entry to the App's existing `client/routes.ts`. Do not add a Client
Route to the File plugin. Put application labels, validation messages, and page
copy in the App's `client/locales/`; the reusable File components keep their
own plugin namespace.

### File lifecycle: immediate persistence, not a form transaction

| User action                          | Server effect                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Select a file                        | Uploads immediately and creates the scoped record.                                                                                                    |
| Remove with `removeOnDelete`         | Immediately deletes the file record and attempts object cleanup.                                                                                      |
| Remove without `removeOnDelete`      | Changes only controlled state; the App must deliberately delete or reconcile it.                                                                      |
| Cancel the form or an upload request | Does not roll back writes already completed on the server. Reload with `client.list()` when reconciling.                                              |
| Select another single file           | First remove the old file explicitly. This is not atomic replacement; retain the old file until a custom replacement workflow succeeds when required. |
| Delete the parent record             | SQL cascade removes rows, not Drive objects. The App must coordinate cleanup before losing disk/key metadata.                                         |

Use the public components by default. Install the Registry `component-ui` only
when the application needs editable UI source; do not maintain both versions
for the same field. Keep MIME rules distinct: Client `accept` permits patterns
such as `image/*`, but Server `mimeTypes` requires exact types such as
`['image/png', 'image/jpeg']` and validates the declared MIME, not file contents.

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
