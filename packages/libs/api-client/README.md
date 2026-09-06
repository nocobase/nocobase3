# `@nocobase/api-client`

A lightweight HTTP and remote Repository client for NocoBase APIs. It does not
connect directly to a database and has no React or application-runtime
dependency.

```ts
import { createApiClient } from '@nocobase/api-client';

const api = createApiClient({ baseURL: '/api' });

const systemInfo = await api.request<SystemInfo>({
  path: '/system-info',
});

await api.request({
  path: '/auth/sign-in/email',
  method: 'POST',
  json: { email, password },
});

const upload = new FormData();
upload.append('file', file);

await api.request({
  path: '/files',
  method: 'POST',
  body: upload,
});

const stream = await api.stream({
  path: '/ai/conversations:send',
  method: 'POST',
  json: { message: 'Hello' },
});

const order = await api.repository<Order>('orders').findOne({
  filter: { id: 'order-1' },
});

const orders = await api.repository<Order>('orders').findMany();

for await (const order of api.repository<Order>('orders').findMany()) {
  console.log(order);
}
```

Use `json` for values that the client should serialize as JSON. Use `body` for
raw Fetch bodies such as `FormData`, `Blob`, and strings. The two options are
mutually exclusive. `request()` defaults to accepting JSON, while `stream()`
defaults to accepting server-sent events; explicit request headers override
both defaults.

Repository calls are encoded as `POST /<name>:<action>`, relative to the API
base URL. For example, `api.repository('orders').findOne()` requests
`POST /api/orders:findOne`. The server decides which repositories and actions
are exposed and remains responsible for authentication, authorization,
validation, and query limits.

`findMany()` is lazy and supports one consumption mode. Await it to request a
complete JSON array, or asynchronously iterate it to request framed NDJSON and
process records as they arrive. A query cannot be awaited and iterated, or be
iterated twice; create another query to execute it again.

## Aggregate and grouped queries

Enable `aggregate` and `groupBy` in the server's `defineRepositoryApiRoutes`
exposure before calling them. Both return promises and accept JSON ASTs, not
builder callbacks or a server database context.

```ts
const repository = api.repository<{ status: string; amount: number }>('orders');
const aggregate = {
  kind: 'aggregate',
  version: 1,
  items: [
    { kind: 'count', alias: 'count' },
    { kind: 'sum', field: 'amount', alias: 'total' },
    { kind: 'avg', field: 'amount', alias: 'average' },
    { kind: 'min', field: 'amount', alias: 'minimum' },
    { kind: 'max', field: 'amount', alias: 'maximum' },
  ],
} as const;
const totals = await repository.aggregate({
  filter: { status: 'paid' },
  aggregate,
});
const groups = await repository.groupBy({
  by: ['status'],
  aggregate,
  having: {
    kind: 'filter',
    version: 1,
    root: {
      kind: 'group',
      logic: 'and',
      items: [
        { kind: 'condition', path: ['count'], operator: '$gte', value: 2 },
      ],
    },
  },
  sort: {
    kind: 'sort',
    version: 1,
    items: [{ kind: 'field', path: ['total'], direction: 'desc' }],
  },
});
```

Requests use `POST /orders:aggregate` and `POST /orders:groupBy`; the client
unwraps `{ data }` into an aggregate object or array of group objects. Exported
contracts are `RemoteAggregateAst`, `RemoteAggregateOptions`,
`RemoteGroupByOptions`, and `RemoteAggregateResult`. Result aliases are dynamic.
An empty input set returns count 0 and null for SUM/AVG/MIN/MAX; empty grouped
results are `[]`. BigInt results are serialized as decimal strings to avoid
precision loss, dates as ISO strings, and dialect-specific numeric strings are
preserved. These methods do not use `findMany` pagination or NDJSON streaming.
