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
      actions: {
        findMany: { maxLimit: 100 },
        findOne: {},
        count: {},
        exists: {},
        createOne: { writePolicy: { fields: ['id', 'status'] } },
        updateOne: { writePolicy: { fields: ['status'] } },
        deleteOne: {},
        aggregate: {},
        groupBy: {},
      },
    },
    {
      name: 'sales/orders',
      collection: 'orders',
      actions: {
        findMany: { maxLimit: 100 },
        findOne: {},
      },
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

Each entry requires `name` and an explicit `actions` object. `collection` defaults
to `name`; optional `connection` selects a configured database connection. Names
must be unique and non-empty and cannot contain `*`. Empty action objects expose
nothing. `actions.findMany.maxLimit` defaults to 100 and is both the default and maximum
`findMany` limit. A limit of zero returns an empty list.

Action values must be configuration objects: `{}` enables an endpoint with defaults,
while an omitted action registers no endpoint. Boolean values and the former action
arrays are rejected. Unknown configuration keys fail at declaration time. Configure
pagination only in `actions.findMany.maxLimit`.

`createOne` and `updateOne` default to `writePolicy: false`, including when the
option is missing. They require explicit server-owned field and relation allowlists
to accept writes; API route policies cannot be `true`.

```ts
defineRepositoryApiRoutes({
  repositories: [
    {
      name: 'projects',
      actions: {
        findMany: { maxLimit: 100 },
        findOne: {},
        count: {},
        exists: {},
        createOne: {
          writePolicy: {
            fields: ['id', 'name', 'status'],
            relations: {
              tasks: { create: { fields: ['id', 'title'] } },
            },
          },
        },
        updateOne: {
          writePolicy: (write) =>
            write
              .fields('name', 'status')
              .relation('tasks', (tasks) =>
                tasks.update((task) =>
                  task
                    .fields('title')
                    .relation('assignee', (a) => a.connect().disconnect()),
                ),
              ),
        },
      },
    },
  ],
});
```

`writePolicy` accepts an object or synchronous callback returning its own builder.
Callbacks run once at declaration and produce detached, frozen snapshots. Policies
can be reused with `buildWritePolicy` from `@nocobase/db`. Missing `fields` and
`relations` each mean `false`. There are no wildcards, inherited grants or implicit
merges. Each nested `create` and `update` has its own field and relation rules.
Relation `upsert` is independent and requires both `create` and `update` branch
policies. `connect`, `disconnect`, `set` and `delete` use operation objects; many-to-many
`create`, `connect` and `set` can allow through payload with
`through: { fields: ['role'] }`. `createOne` only allows `create` and `connect`
relations throughout its create tree.

`false` rejects the whole write, even empty values. An empty object policy `{}`
allows no caller-supplied fields or relations but can allow default-only creation.
Scalar foreign keys are covered by `fields`; JSON fields are controlled as a whole.
Managed relation keys, defaults and versions do not require client field grants.
Read actions and root `deleteOne` have no write policy; `deleteOne: {}` enables deletion.

HTTP input rejects client-supplied `writePolicy`; the adapter always injects its
server configuration. `WRITE_FORBIDDEN`, `FIELD_WRITE_FORBIDDEN` and
`RELATION_WRITE_FORBIDDEN` return HTTP 403 with diagnostic `path` and `details`.
The entire mutation is checked before writes. Internal `db.repository` calls default
to `writePolicy: true`; custom HTTP handlers must supply their own explicit policy.
User authorization, row-level access, target access and database cascades remain
separate concerns. See the [complete write policy reference](../../libs/db/docs/zh-CN/repository/write-policy.md).

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
`updateOne`, `deleteOne`, `aggregate`, and `groupBy`. Unconfigured names and actions have no route.
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

## Repository aggregate endpoints

Add `aggregate` and `groupBy` to an exposure's `actions` to enable
`POST /<name>:aggregate` and `POST /<name>:groupBy`. Neither endpoint is enabled
implicitly. As with other Repository actions, the contribution installs no
access policy: the owning application or plugin must guard its declared routes.

`aggregate` accepts a required Aggregate AST and an optional `filter`.
`groupBy` also requires a non-empty `by` array and accepts `having` and `sort`
over grouped fields and aggregate aliases. Envelopes must be JSON objects;
unknown options, callbacks, database context, and pagination are unsupported.
Repository validates AST versions, expressions, aliases and field capabilities
and returns the existing `{ code, message }` error response with status 400.
The 1 MiB body limit also applies to both actions.

`maxLimit` applies only to `findMany`. Aggregations operate over all matching
rows, and `groupBy` returns all matching groups without pagination. Responses
are `{ data: aggregateObject }` or `{ data: groupObjects }`. BigInt scalar results
become decimal strings without precision loss. See the
[`@nocobase/api-client` examples](../../libs/api-client/README.md#aggregate-and-grouped-queries)
for the JSON Aggregate, Filter and Sort AST contracts.
