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
