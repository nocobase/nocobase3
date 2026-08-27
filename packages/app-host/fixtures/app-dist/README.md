# app-dist example

This directory contains minimal `APP_DIST_DIR` examples for `@nocobase/app-host`.

Supported app artifact shape:

```text
demo/
  package.json
  dist/client/index.html
  dist/client/assets/...
  dist/server/embedded.js

service/
  package.json
  dist/server/embedded.js

lifecycle/
  package.json
  dist/client/index.html
  dist/client/assets/...
  dist/server/embedded.js

ws-demo/
  package.json
  dist/client/index.html
  dist/client/assets/...
  dist/server/embedded.js

orders/
  releases/
    release-v1/
      app-release.json
      package.json
      dist/server/embedded.js
    release-v2/
      ...
    release-broken/
      ...

crm/
  releases/
    release-v1/
      ...
    release-v2/
      ...
    release-v3/
      ...

service-desk/
  releases/
    release-service-desk-native-v1/
      app-release.json
      package.json
      dist/client/...
      dist/server/...
    release-v1/
      ...
    release-v2/
      ...
```

`dist/server/embedded.js` is required. `dist/client/assets/**` is optional and
is the only client output path that the host treats specially:

```text
/<app>/assets/*  -> dist/client/assets/*
/<app>/*         -> dist/server/embedded.js with /<app> stripped
```

If an app has `dist/client/index.html`, the server artifact is responsible for
reading and returning it. The host does not provide SPA fallback routing.

The server artifact should export `createServer(scope)`. For example,
`/<app>/api/info` is available to the server as `/api/info`.
The returned app object should expose `fetch(request)` and may expose
`websocket(request)`. Register cleanup with `scope.registerDisposer(...)`.

Run it from the repository root:

```bash
pnpm app-host:dev
```

Or pass the fixture path explicitly:

```bash
APP_DIST_DIR="$PWD/packages/app-host/fixtures/app-dist" pnpm --filter @nocobase/app-host start
```

Then open:

```text
http://127.0.0.1:3000/demo/
http://127.0.0.1:3000/demo/assets/demo.js
http://127.0.0.1:3000/demo/api/info
http://127.0.0.1:3000/demo/healthz
http://127.0.0.1:3000/service/healthz
http://127.0.0.1:3000/lifecycle/
http://127.0.0.1:3000/lifecycle/api/lifecycle
http://127.0.0.1:3000/lifecycle/healthz
http://127.0.0.1:3000/ws-demo/
http://127.0.0.1:3000/ws-demo/api/info
http://127.0.0.1:3000/ws-demo/healthz
ws://<host>/ws-demo/ws
```

`lifecycle/dist/server/embedded.js` is the most complete example in the fixture
set. It:

- registers a `beforeDestroy` hook with `scope.onBeforeDestroy(...)`
- registers a runtime disposer with `scope.registerDisposer(...)`
- implements a composite `dispose()` function
- exposes the current runtime snapshot at `/api/lifecycle`

That makes it a good starting point when you want to see the destroy order in
one place.

`ws-demo/dist/server/embedded.js` exposes `/ws` as the app-local WebSocket
route. The fixture page derives `ws://<host>/ws-demo/ws` from the current page
origin and displays the current server time from that socket.

The `orders`, `crm`, and `service-desk` apps form the governed release demo:

- `orders` demonstrates a health-gate rejection and rollback. Deploy V1,
  promote V2, prove that the unhealthy candidate is blocked while V2 stays
  online, then roll back to V1.
- `crm` provides three visually distinct healthy releases so V2 can stay
  online with V1 as a rollback point and V3 as a promotion candidate.
- `service-desk` includes a native business release with persistent tickets,
  customers, SLA management, assignment, replies, and controlled status
  transitions. Its earlier V1/V2 releases remain as lightweight rollback
  fixtures.

Use the matching `__apps/<app>` management endpoints or NocoBase Hub to deploy,
promote, and roll back these releases.
