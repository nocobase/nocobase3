# Quick start for an application

Add private PDF attachments to a saved order using the application's existing
Database, Drive, Session, authentication, authorization, and API Client. The
migration, Server route, and Client form are inline below; no separate example
project or new business backend plugin is needed.

Read the target App's `AGENTS.md` and Client/Server instructions. Confirm that
File, Authentication, and Authorization are registered and migrated. Configure
S3 or another disk through the App's existing Drive configuration, not in the
browser. Do not edit the File plugin or synchronized `.agents/skills/` files,
run `plugin:create`, or add a `defineServerPlugin()` for this feature.

## 1. Add the migration

Create `database/migrations/202609070001_order_attachments.ts` in the App:

```ts
import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202609070001_order_attachments',
  up: async ({ builder }) => {
    await builder.createCollection('purchaseOrders', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('number', { length: 64 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.primary('id', { name: 'pk_purchase_orders' });
    });
    await builder.createCollection('purchaseOrderAttachments', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('orderId', { length: 64 }).notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 512 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').unsigned().notNull();
      collection.boolean('public').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_purchase_order_attachments' });
      collection.unique(['disk', 'key'], { name: 'uq_order_attachment_key' });
      collection.index('orderId', { name: 'idx_order_attachments_owner' });
      collection
        .belongsTo('order', 'purchaseOrders', { index: false })
        .foreignKey('orderId')
        .targetKey('id')
        .constraints(true)
        .onDelete('restrict');
    });
    await builder.alterCollection('purchaseOrders', (collection) => {
      collection
        .hasMany('attachments', 'purchaseOrderAttachments')
        .sourceKey('id')
        .foreignKey('orderId');
    });
  },
  down: async ({ builder }) => {
    await builder.dropCollection('purchaseOrderAttachments');
    await builder.dropCollection('purchaseOrders');
  },
});
```

For an existing parent, omit its creation and deletion, and add the inverse
relation through the new migration. Match `orderId` and its validation below
to the parent's actual ID type. Keep the standard file columns, owner index,
and `UNIQUE (disk, key)`. See [data model](data-model.md) for other relations.

## 2. Add the Server route

Create `server/routes/order-attachments.ts`. The callback authorizes both the
parent record range and the `attachments` field before file operations:

```ts
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
  type DatabaseAuthorizationConditions,
  type DatabaseFieldFilter,
  type DatabaseFilter,
  type DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';
import {
  createFileRoute,
  type FileRouteAction,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { appConfig } from '@nocobase/app-server/config';
import { driveConfig, driveManagerToken } from '@nocobase/app-server/drive';
import { sessionManagerToken } from '@nocobase/app-server/session';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  databaseManagerToken,
  type ComparisonOperator,
  type Expression,
  type ExpressionBuilder,
  type SqlBool,
} from '@nocobase/db';
import { Hono } from 'hono';
import { every } from 'hono/combine';
import { HTTPException } from 'hono/http-exception';

const parentActions: Readonly<Record<FileRouteAction, 'read' | 'update'>> = {
  list: 'read',
  read: 'read',
  'issue-token': 'read',
  upload: 'update',
  delete: 'update',
};

export const orderAttachmentRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const database = app.container.resolve(databaseManagerToken);
    const authorization = app.container.resolve(authorizationToken);
    // Extend the owning registration instead if this collection exists.
    // Registration describes capabilities; it does not grant access.
    authorization.database.collections.add({
      name: 'purchaseOrders',
      actions: ['read', 'create', 'update', 'delete'],
      fields: ['id', 'number', 'ownerId', 'attachments'],
      attributes: { identifier: 'id', owner: 'ownerId' },
    });
    const router = new Hono();
    router.route(
      '/purchase-orders/:orderId/attachments',
      createFileRoute({
        database,
        table: 'purchaseOrderAttachments',
        scope: (context) => ({
          orderId: parseOrderId(context.req.param('orderId')),
        }),
        drive: app.container.resolve(driveManagerToken),
        defaultDisk: app.config.get(driveConfig).default,
        publicBasePath: app.config.get(appConfig).publicBasePath,
        tokenSecret: app.container.resolve(sessionManagerToken).config.secret,
        audience: 'purchase-order-attachments',
        auth: every(
          app.container.resolve(authenticationToken).required(),
          authorization.middleware(),
        ),
        authorize: async (context, fileAction) => {
          const { authz }: Partial<AuthorizationEnv['Variables']> = context.var;
          if (!authz) return false;
          const action = parentActions[fileAction];
          const decision = await authz.authorize({
            resource: {
              type: 'database.collection',
              id: 'main.purchaseOrders',
            },
            action,
            params: {
              fields:
                action === 'read'
                  ? { output: ['attachments'] }
                  : { input: ['attachments'] },
            },
          });
          if (
            decision.effect !== 'conditional' ||
            decision.conditions?.type !== 'database'
          ) {
            return false;
          }
          const conditions =
            decision.conditions as DatabaseAuthorizationConditions;
          return database
            .query()
            .selectFrom('purchaseOrders')
            .where('id', '=', parseOrderId(context.req.param('orderId')))
            .where((eb) => compileFilter(eb, conditions.filter))
            .exists();
        },
        limits: {
          maxFiles: 10,
          maxSize: 50 * 1024 * 1024,
          mimeTypes: ['application/pdf'],
        },
      }),
    );
    return router;
  });

function parseOrderId(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9_-]{1,64}$/u.test(value)) {
    throw new HTTPException(400, { message: 'A valid orderId is required.' });
  }
  return value;
}
```

Append the following filter adapter to the same route file, or reuse the App's
existing adapter. It translates the Authorization Filter AST, not a
browser-supplied filter. Unsupported operators throw rather than bypass ACL.

<details>
<summary>Authorization filter adapter</summary>

```ts
type FilterOperators = Readonly<
  Record<DatabaseFilterOperator, ComparisonOperator>
>;
const operators: FilterOperators = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $notIn: 'not in',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

function compileFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  return eb.and(
    Object.entries(filter).map(([field, value]) => {
      if (field === '$and' || field === '$or') {
        if (!Array.isArray(value)) {
          throw new TypeError('Invalid authorization filter.');
        }
        const nested = (value as readonly DatabaseFilter[]).map((item) =>
          compileFilter(eb, item),
        );
        return field === '$and' ? eb.and(nested) : eb.or(nested);
      }
      return eb.and(
        Object.entries(value as DatabaseFieldFilter).map(
          ([operator, expected]) => {
            const comparison = operators[operator as DatabaseFilterOperator];
            if (!comparison) {
              throw new TypeError('Unsupported authorization filter operator.');
            }
            return eb(
              field,
              expected === null && operator === '$eq'
                ? 'is'
                : expected === null && operator === '$ne'
                  ? 'is not'
                  : comparison,
              expected,
            );
          },
        ),
      );
    }),
  );
}
```

</details>

Import `orderAttachmentRoutes` and append it to the existing array in
`server/routes/index.ts`, already consumed by `server/runtime.ts`. Preserve the
other routes; `defineApiRoutes()` supplies `/api`, so do not add it to the child
path.

Grant `purchaseOrders.read` / `purchaseOrders.update`, the `attachments` field,
and the intended record range through the existing Permission Sets. For
example, `recordsIOwn` uses `ownerId`; `allRecords` requires an explicit business
decision. Registration alone grants nothing. Do not replace the conditional
parent query with `can()` or `return true`, or treat file `scope` as ACL.

Keep authentication in the factory's `auth` option, not on the whole router.
Private content uses capability URLs obtained by the Client preview components;
an unsigned private `contentUrl` is not usable even with a session.

## 3. Add the Client form

Create `client/components/order-attachments.tsx`:

```tsx
import {
  apiClientToken,
  useService,
  type ApiClient,
} from '@nocobase/app-client';
import {
  createFilesClient,
  FilePreviewField,
  FileUploadField,
  type FileRecord,
  type FileUploadStatus,
} from '@nocobase/app-plugin-file/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

export interface OrderAttachmentsProps {
  readonly orderId?: string;
  readonly onDone: () => void;
}

export default function OrderAttachments(
  props: OrderAttachmentsProps,
): ReactElement {
  const api = useService(apiClientToken);
  if (!props.orderId) return <p>Save the order before adding attachments.</p>;
  // Key the component owning all attachment state, not only the upload field.
  return (
    <SavedOrderAttachments
      key={props.orderId}
      api={api}
      orderId={props.orderId}
      onDone={props.onDone}
    />
  );
}

function SavedOrderAttachments({
  api,
  orderId,
  onDone,
}: {
  readonly api: ApiClient;
  readonly orderId: string;
  readonly onDone: () => void;
}): ReactElement {
  const client = useMemo(
    () =>
      createFilesClient({
        api,
        endpoint: `purchase-orders/${encodeURIComponent(orderId)}/attachments`,
      }),
    [api, orderId],
  );
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<FileUploadStatus>('idle');

  useEffect(() => {
    let active = true;
    void client
      .list()
      .then((records) => {
        if (!active) return;
        setFiles(records);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Unable to load attachments.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [client, attempt]);

  const ready = loaded && status === 'idle';
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onDone();
      }}
    >
      <p>
        Uploads and deletions are saved immediately. Closing this form does not
        undo them.
      </p>
      {!loaded && !loadError ? (
        <p role='status'>Loading attachments...</p>
      ) : null}
      {loadError ? (
        <div role='alert'>
          {loadError}
          <button
            type='button'
            onClick={() => {
              setLoadError(undefined);
              setAttempt((value) => value + 1);
            }}
          >
            Retry loading
          </button>
        </div>
      ) : null}
      {operationError ? <p role='alert'>{operationError}</p> : null}
      <FileUploadField
        client={client}
        value={files}
        onChange={(records) => {
          setFiles(records);
          setOperationError(undefined);
        }}
        onError={(error) => setOperationError(error.message)}
        onStatusChange={setStatus}
        multiple
        accept={['application/pdf']}
        maxSize={50 * 1024 * 1024}
        maxFiles={10}
        disabled={!loaded}
        removeOnDelete
      />
      <FilePreviewField
        client={client}
        files={files}
        onError={(error) => setOperationError(error.message)}
      />
      <button type='submit' disabled={!ready}>
        Done
      </button>
    </form>
  );
}
```

Mount `OrderAttachments` with the saved `orderId` and an `onDone` callback that
closes the editor or returns to the order. It already renders a form; do not
nest it inside another form. When adapting an existing form, retain initial
loading/retry, the owner key, ignored stale responses, and the upload submit
guard. A missing ID must not construct an endpoint or enable uploads.

The endpoint is relative to the App's API root: no `/api`, origin, public base
path, query, or fragment. Use public components by default; install Registry
`component-ui` only for editable UI source, not alongside a second copy of the
same field. Put application copy in `client/locales/`; add a page only when the
business workflow needs one.

## 4. Preserve lifecycle semantics

Uploads persist immediately; `onDone` does not save them again, and cancelling
does not roll them back. `removeOnDelete` immediately deletes the file record
and attempts object cleanup; without it, removal changes only local state.
Reconcile with `client.list()` after interrupted requests. Single-file mode
requires explicit removal before another upload; it is not atomic replacement.

The restrictive parent foreign key preserves cleanup metadata. Delete
attachments deliberately before the order, with a policy for failed cleanup.
SQL cascade deletes rows, not Drive objects. Never store final URLs or tokens,
or accept disk, key, table, scope field names, or signing settings from the
browser. Client `accept` may use `image/*`; Server `mimeTypes` needs exact values
and validates declared MIME, not file contents.

## 5. Verify in the target App

Run the App's migration and existing lint, typecheck, tests, and build. Check
permitted/anonymous/denied requests, parent and attachment-field permissions,
private previews, owner switching, loading/retry, upload errors, reload, and
deletion/object cleanup on the real page under its configured public base path.
See [Route API](route-api.md) for the HTTP contract and token/limit behavior.
