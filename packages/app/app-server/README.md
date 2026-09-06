# `@nocobase/app-server`

## Repository API routes

`defineRepositoryApiRoutes()` exposes explicitly configured Collection Repository
methods as API route contributions. Importing or declaring a contribution does
not resolve services or query the database. The application resolves
`databaseManagerToken` when it creates the router.

```ts
import { defineRepositoryApiRoutes } from '@nocobase/app-server/router';
import { defineServerPlugin } from '@nocobase/app-server/plugins';

const repositoryRoutes = defineRepositoryApiRoutes({
  repositories: [
    {
      name: 'orders',
      actions: [
        'findMany',
        'findOne',
        'count',
        'exists',
        'createOne',
        'updateOne',
        'deleteOne',
      ],
      maxLimit: 100,
    },
    {
      name: 'sales/orders',
      collection: 'orders',
      actions: ['findMany', 'findOne'],
    },
  ],
});

export default defineServerPlugin({
  packageName: '@nocobase/app-plugin-orders',
  routes: [repositoryRoutes],
});
```

Register the plugin in the target application's existing `server/plugins.ts`.
Applications may also include the contribution directly in their route array.
The Collection must already exist; this helper does not create schema or run
migrations. No repositories are exposed automatically.

Each entry requires `name` and an explicit `actions` array. `collection` defaults
to `name`; optional `connection` selects a configured database connection. Names
must be unique and non-empty and cannot contain `*`. Empty action arrays expose
nothing. `maxLimit` defaults to 100 and is both the default and maximum
`findMany` limit. A limit of zero returns an empty list.

The application adds `/api`. Each action uses
`POST /api/<encodeURIComponent(name)>:<action>` with a JSON object containing
Repository options. For example:

```ts
import { createApiClient } from '@nocobase/api-client';

const api = createApiClient({ baseURL: '/api' });
const orders = api.repository<{ id: string; status: string }>('orders');

const records = await orders.findMany({
  filter: { status: 'draft' },
  limit: 20,
});

for await (const record of orders.findMany({
  filter: { status: 'draft' },
  limit: 20,
})) {
  console.log(record);
}
const result = await orders.createOne({
  values: { id: 'order-1', status: 'draft' },
});
```

Supported actions are `findMany`, `findOne`, `count`, `exists`, `createOne`,
`updateOne`, and `deleteOne`. Unconfigured names and actions have no route.
Responses use `{ data: result }`, including complete mutation results (`record`,
`createdTargets`, and optional `version`). Missing `findOne` records return
`{ data: null }`, which the client converts to `undefined`. Delete success also
returns JSON (`{ data: { deleted: true } }`), not an empty 204 response.

`findMany()` also supports asynchronous iteration. Awaiting the query sends
`Accept: application/json` and returns the complete array. Iterating it sends
`Accept: application/x-ndjson`; the route consumes the database query as an
`AsyncIterable` and returns framed `record`, `error`, and `end` lines. The same
query instance supports only one consumption mode. Stopping iteration cancels
the response and closes the database iterator.

The adapter requires `application/json`, limits request bodies to 1 MiB, checks
the options envelope, and delegates AST, field, and mutation validation to the
Repository. JSON shorthand and AST inputs are supported; JavaScript builder
callbacks and client-supplied `context` are not. `idempotencyKey` is currently
rejected as an unsupported option rather than silently ignored. `ifVersion` is
forwarded for updates and deletes.

Input errors return 400, record-not-found errors return 404, and version or
single-record cardinality conflicts return 409, with `{ code, message }` bodies.
Malformed JSON returns 400, non-JSON content returns 415, and oversized bodies
return 413. Unexpected/database-configuration errors propagate to the host error
handler as server errors.

This basic adapter deliberately does **not** install authentication or
authorization. Configured endpoints accept anonymous requests and have no field
or record permission filtering. Exposure configuration is not a permission
policy. No application endpoints are enabled merely by importing this helper.
