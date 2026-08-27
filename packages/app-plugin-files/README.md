# @nocobase/app-plugin-files

`FileService` is the public application service for managed Files. Applications
create one App-scoped `FilesRuntime`, mount its capability-protected Core route,
and mount a business-scoped `createFileRoute()` where record authorization is
available.

Local and S3-compatible storage use the same lifecycle:

```text
POST scoped route -> PUT upload -> POST complete -> GET/HEAD content
                              \-> DELETE upload (best-effort cancel)
```

The scoped route also lists attached files and detaches them with `DELETE
/:fileId`. It does not expose a generic `/api/upload`, a public `/uploads`
directory, or a separate commit/access protocol.

## Purchase order attachments

The relation collection must contain `id`, `purchaseOrderId`, `fileId`, `slot`,
`reservationExpiresAt`, `createdAt`, and `updatedAt`. Keep unique constraints on
`(purchaseOrderId, slot)` and `(purchaseOrderId, fileId)`, and foreign keys to
the business record and `files.id`.

Mount the Core route at the public capability boundary and the relation route
at the session-protected business boundary:

```ts
const filesRuntime = createFilesRuntime({
  database,
  config,
  audience,
  secret,
  basePath: '/api/files',
});
const fileService = createFileService({
  runtime: filesRuntime,
  publicBasePath: appPublicBasePath,
});

publicRoutes.route('/files', createCoreFilesRoute(filesRuntime));
protectedRoutes.route(
  '/purchase-orders/:purchaseOrderId/attachments',
  fileService.createFileRoute({
    binding: {
      type: 'relation',
      collection: 'purchaseOrderAttachments',
      recordParam: 'purchaseOrderId',
      recordField: 'purchaseOrderId',
      maxFiles: 10,
    },
    constraints: {
      maxBytes: 50 * 1024 * 1024,
      allowedExtensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx'],
    },
    authorize: ({ action, recordId, fileId }) =>
      authorizePurchaseOrderAttachment({
        action,
        purchaseOrderId: recordId,
        fileId,
      }),
  }),
);
```

Both mount paths are relative to the App API composition root and therefore do
not contain `/api`. Create the Core route, scoped route, and `FileService` from
the same runtime. `authorize` must enforce record existence and the relevant
read, write, or share permission.

Install the editable upload component. Repository materialization follows the
item's local Registry dependencies, so this one action also installs
`provider-ui`:

```bash
pnpm registry materialize \
  --package @nocobase/app-plugin-files \
  --item component-ui \
  --output-root /path/to/app
```

Use the same scoped route path as the component's App-relative `basePath`:

```tsx
import { useState } from 'react';

import {
  FileUploadField,
  type StoredFile,
} from '@/extensions/nocobase-files-component-ui';

export function PurchaseOrderAttachments({
  purchaseOrderId,
}: {
  purchaseOrderId: string;
}): React.ReactElement {
  const [files, setFiles] = useState<StoredFile[]>([]);

  return (
    <FileUploadField
      basePath={`purchase-orders/${purchaseOrderId}/attachments`}
      value={files}
      onChange={setFiles}
      multiple
      required
      minimum={1}
      maxFiles={10}
      maxBytes={50 * 1024 * 1024}
      accept={['.pdf', '.doc', '.docx', '.xls', '.xlsx']}
    />
  );
}
```

`basePath` is relative to the current App API base. It must not contain `/api`,
an absolute URL, a query string, a hash, or a parent path segment. Preview and
download are handled inside the component from `basePath` and `StoredFile`
metadata. Business code must not construct or persist temporary file access
URLs.

`createFileRoute()` validates static option shapes synchronously and starts an
asynchronous query check for the configured collection and required fields.
Every scoped request waits for that check before authorization or handler code
runs. The current database API does not expose portable column-type
introspection, so exact type compatibility and custom physical name mappings
remain migration responsibilities in Files V1.

## Default client page

Enabling the plugin contributes one lazy authenticated route at `/files`. Its
stable ID is `FILES_ROUTE_IDS.index` (`@nocobase/app-plugin-files:index`). The
plugin-owned fallback is a small capability/status page, not a global file
manager. Installing `page-ui` replaces only that route component while the
plugin retains the path, ID, authentication metadata, and fallback.

## Registry UI

The plugin publishes exactly three application-owned Registry items:

| Item           | Installed target                                | Integration                                        |
| -------------- | ----------------------------------------------- | -------------------------------------------------- |
| `page-ui`      | `client/extensions/nocobase-files-page-ui`      | Overrides only `FILES_ROUTE_IDS.index`             |
| `component-ui` | `client/extensions/nocobase-files-component-ui` | Upload, preview, download, detach, and form fields |
| `provider-ui`  | `client/extensions/nocobase-files-provider-ui`  | App client defaults, Context, Provider, and hook   |

`page-ui` and `component-ui` declare `provider-ui` as a Registry dependency.
Local materialization and hosted shadcn installation resolve that dependency
recursively. Application shadcn primitives such as `button` remain normal
Registry dependencies of the consuming application.

Build all three items or one item at a time:

```bash
pnpm registry build --package @nocobase/app-plugin-files
pnpm registry build \
  --package @nocobase/app-plugin-files \
  --item component-ui
```

Installed source belongs to the application. Upgrade it with a three-way merge
instead of overwriting application changes.

## Expired upload cleanup

The plugin bootstrap registers one Queue schedule against the same
`FilesRuntime` and Storage instance used by `FileService`. Every five minutes it
selects at most 100 expired pending uploads or relation reservations and spends
at most five seconds on one run. Claims and reservation releases use
compare-and-set conditions, so ready files, renewed reservations, and uploads
that complete during selection are skipped.

Temporary object deletion is best-effort. A failed delete leaves the file in a
retryable failed state and a later run converges; completed cleanup is
idempotent. Operators can tune the scheduling infrastructure, but Files V1 does
not expose cleanup, repository, Storage, capability codec, complete, or purge
internals as public package APIs.

## V1 limits

Files V1 uses logical collection and field names with the QueryAdapter's
default naming normalization. It does not promise custom `tableName`,
`columnName`, or `tablePrefix` mappings. It also does not provide a full file
manager, automatic Registry upgrades, or a Registry/CDN publishing service.
