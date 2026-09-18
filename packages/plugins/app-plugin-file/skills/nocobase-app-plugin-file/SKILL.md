---
name: nocobase-app-plugin-file
description: Add file collections, uploads, downloads, business attachments, and editable Registry file components to a NocoBase 3 App using the public File Repository services.
---

# Add files to an App

Use `@nocobase/app-plugin-file/server` and `@nocobase/app-plugin-file/client`. The plugin provides Repository managers, service tokens, route helpers, and the component-ui Registry recipe. The App or business plugin owns collections, migrations, Drive configuration, resource routes, permissions, and pages.

Inspect the App's existing registrations, migrations, disks, and resources first. Register the Server default export and the Client default factory before consumers, using the App's plugin lifecycle commands. The core does not create collections or routes.

## Work incrementally

- Use standard File Repository routes, the Client File Repository and Registry components for new attachment features. Save associations through the existing business API, whether standard CRUD or custom routes; do not migrate working business routes just to add files.
- Extend existing services, middleware, response adapters or installed UI components where needed. A necessary compatibility handler should delegate to File Repository; do not rebuild upload, storage and metadata handling with Drive or replace the whole CRUD stack.
- Inspect the App's registration, collection, disk and business save path together. Reuse what works; do not ask the user to choose an implementation or repeatedly explore source when the documented contract suffices.
- Verify one small upload → metadata query → content download before building UI. Then wire the returned IDs into the existing save/detail flow. Retain uploaded IDs if the business save fails, and run the affected checks after edits stabilize.

The following business example uses collection `invoice_files`, resource `invoiceAttachments`, connection `main`, and disk `local`. Adapt these to the App.

## Collection

Create an App-owned, self-contained migration under `database/main/migrations/` with a unique name matching its filename. Replace `main` with the target connection when needed:

```ts
import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609080001_create_invoice_files',
  async up({ builder }) {
    await builder.createCollection('invoice_files', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('invoice_files');
  },
});
export default migration;
```

The fields are fixed; mapping is unsupported. The primary key must accept a 36-character UUID, string fields accept string/char/text, size accepts integer/bigInt, and timestamps accept datetime/datetimeTz. Apply with the App's migration command. Never import a live collection schema from a migration.

Upload generates the ID and storage key, normalizes the filename/extension, validates stored size, and supplies timestamps. Extra required columns need defaults because upload accepts no business values. `contentUrl` is derived, never persisted. Save returned file IDs through an App-owned relation or link table when submitting the business form; upload and form submission are separate commits.

## API routes

Declare in the App or business plugin's Server routes module and merge both returned contributions into its existing routes:

```ts
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';

const fileRoutes: ReturnType<typeof defineFileRepositoryApiRoutes> =
  defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: 'invoiceAttachments',
        collection: 'invoice_files',
        connection: 'main',
        disk: 'local',
        accessPath: '/uploads/invoices',
        accessMode: 'stream',
        policy: {
          read: { scope: true, fields: ['id', 'filename', 'ext', 'size'] },
          create: { scope: true },
          update: false,
          delete: { scope: true },
        },
        actions: {
          findMany: { maxLimit: 100 },
          findOne: {},
          deleteOne: {},
          uploadOne: { maxSize: 5 * 1024 * 1024 },
          uploadMany: { maxSize: 20 * 1024 * 1024 },
        },
      },
    ],
  });
export default fileRoutes;
```

`name` is the Client resource; `collection` defaults to name, `connection` to the database default, and `accessPath` to `/uploads/<name>`. Disk is required. Content paths contain static alphanumeric, underscore or hyphen segments, start with `/`, and have no trailing slash.

Only declared POST `/api/<name>:<action>` operations are exposed. Ordinary actions are `findMany/findOne/count/exists/aggregate/groupBy/createOne/updateOne/deleteOne`. There are no createMany/updateMany/deleteMany HTTP actions.

`policy` is required and governs every action of the exposure, uploads included. It is a Repository Policy: `read`, `create`, `update` and `delete`, each `true`, `false`, or a rule node. A node that is `false` refuses that operation; a node with no `fields` accepts no caller-supplied field, which is what a metadata `createOne` needs before it will accept anything. Pass a function of the principal — `policy: (principal) => ({ ... })` — together with a `principal(context)` resolver to scope rows to the caller; without a principal the request is refused with 403.

An upload supplies no caller fields, so it binds a Policy derived from this one: the `create` scope and defaults are inherited and the field allowlist is replaced by the file columns. `create: false` therefore forbids uploading as well as creating metadata, and a `create.defaults` of `{ ownerId }` is stamped onto uploaded rows — which is what keeps an uploaded file inside the same scope `findMany` reads. The content route under `accessPath` is the exception: it is public and this Policy does not reach it.

Content is GET `<accessPath>/<uuid>.<ext>` outside `/api`, omitting the dot when extensionless. Stream returns full bytes as an attachment; redirect returns a public storage URL or a five-minute signed URL. A disk without URL support requires stream mode; there is no automatic fallback.

These are public routes. For restricted files, register App-owned authentication and authorization on the paths each contribution owns before mounting it — `/<name>:<action>` per exposed API action, `<accessPath>/*` for content. Never `router.use('*', ...)` in a contribution router: contributions share the mounted router, so it also guards the SPA and every contribution mounted after yours. Check the operation and record/parent-record access; a login page, private disk, Client filter or Policy field allowlist is not authentication. Add scoped middleware and principal-based Policy to the generated routes first. If an existing contract needs an adapter, extend that module using the public Server manager and retain its authorization checks; missing built-in authentication alone is not a reason to replace the routes. Never trust browser-supplied ownership.

## Server and Client services

Resolve the original token from the current App container after registration; in a ServiceProvider use `this.app.container`. Do not create another database, Drive manager, or API Client.

```ts
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';

const manager = container.resolve(serverFileRepositoryManagerToken);
const files = manager.repository('invoice_files', {
  connection: 'main',
  disk: 'local',
  accessPath: '/uploads/invoices',
  // Only the upload path binds this; the Repository itself is unrestricted,
  // as a db.repository() call is.
  policy: { read: true, create: true, update: false, delete: false },
});
const { record } = await files.uploadOne({ file });
const url = files.getUrl(record);
```

Server repository() takes the exact logical name from createCollection, not its physical table name (for example, crmAccountFiles is not crm_account_files), and requires disk/accessPath matching its routes. getUrl is synchronous and App-local; getStorageUrl asynchronously uses the record's disk/key to obtain a public or signed storage URL. Neither queries the database. Direct Server CRUD does not decorate URLs; uploads do.

Client code resolves `clientFileRepositoryManagerToken` and calls `manager.repository('invoiceAttachments')` with the resource name. It reuses apiClientToken, session and base URL; do not pass disk/connection/accessPath.

```ts
const { record } = await files.uploadOne({ file });
const batch = await files.uploadMany({ files: Array.from(input.files ?? []) });
const rows = await files.findMany({ limit: 20 });
await files.deleteOne({ filter: { id: record.id } });
```

Inputs are a native File or a nonempty File array. Results are `{ record, createdTargets, version? }` and `{ createdCount, records }`. Upload already creates metadata. Client uploads accept an optional second `{ signal }` argument; abort does not undo a server commit. Use returned contentUrl directly: HTTP already adds the host prefix, such as `/main`. Custom selects need id and ext for contentUrl; UI also needs filename, mimeType, size and timestamps.

## Registry components

Install component-ui for editable upload, list, thumbnail and preview source. From a NocoBase source workspace:

```bash
pnpm registry materialize --package @nocobase/app-plugin-file --item component-ui --output-root packages/templates/app-template-default
```

Materialize copies source only. The App must provide React/React DOM, lucide-react, react-markdown, remark-gfm and shadcn button/dialog primitives. It adds no route or permissions. A hosted Registry JSON can instead be installed with shadcn add; npm publication alone supplies no Registry URL.

Compose inside the started App's React context:

```tsx
import { useMemo, useState, type ReactElement } from 'react';
import { useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';
import {
  FileUploadField,
  FileList,
} from '@/extensions/nocobase-file-component-ui';

export function InvoiceAttachments(): ReactElement {
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('invoiceAttachments'),
    [manager],
  );
  const [value, setValue] = useState<readonly FileRecord[]>([]);
  const [error, setError] = useState('');
  return (
    <>
      <FileUploadField
        repository={repository}
        value={value}
        onChange={setValue}
        multiple
        onError={(cause) => setError(cause.message)}
      />
      <FileList files={value} onError={(cause) => setError(cause.message)} />
      {error && <p role='alert'>{error}</p>}
    </>
  );
}
```

FileUploadField takes a repository and controlled value/onChange; onStatusChange reports idle/uploading/error so forms can prevent incomplete submissions. Accept/maxSize/maxFiles are UI checks. removeOnDelete calls deleteOne, deleting metadata only; otherwise removal unlinks the selection. Read-only FileList, FileThumbnail, FilePreviewField and FilePreviewDialog use contentUrl without a repository prop. Import UI types from the installed recipe. Supply translated labels and adapt App-owned source as needed.

Preview supports safe raster images, PDF via a fetched blob, text/Markdown, audio/video and Office fallback. HTML/SVG/XML previews and unsafe URL schemes are rejected. Office Online requires an internet-accessible URL and cannot use the App session. Same-origin fetches include credentials; external fetches need CORS. Bearer-only content policies need an App-owned authenticated blob adapter. Merge installed source upgrades with App customizations.

## Verify and handle failures

Verify upload → query → contentUrl → identical downloaded bytes, including batch upload, resource aliases and host prefixes. After materialization run the consuming App's typecheck/build and exercise upload, cancel/retry, remove, download and preview. Restricted files need anonymous, forbidden-user and permitted-user tests against both API and content routes. Inspectors check registration only.

- Upload defaults are 5 MiB single / 20 MiB batch for the whole multipart body, including overhead. Direct Server uploads have no HTTP limit; UI maxSize checks an individual file. The Client supplies the multipart boundary.
- BODY_TOO_LARGE (413): reduce request size or adjust route limits. INVALID_FILE/INVALID_FILES (400): send native File values and a nonempty batch.
- INVALID_FILE_COLLECTION: first compare the migration name, route collection and Server repository argument; then await collections.get(logicalName) and check the active connection and generated metadata. SQLite physical text does not imply a broken datetime definition. Fix the specific lookup, metadata or schema problem and retry the same upload; do not bypass File Repository. Use a new migration for corrections to already-merged history.
- STORAGE_URL_UNAVAILABLE: configure a capable disk or stream mode.
- FILE_COMMIT_UNCERTAIN / FILE_CLEANUP_FAILED: reconcile database records and stored objects before retrying; uploads have no idempotency key.

There is no built-in route authentication, row ACL, Range/206, ETag, conditional download, resumable upload, physical cleanup, content sniffing or malware scan. Metadata deletion retains objects; cancelled forms may leave unlinked files. Implement the policies required by the business, including referenced-file deletion and orphan cleanup.
