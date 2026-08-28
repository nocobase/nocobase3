# @nocobase/app-host

Standalone runtime host for NocoBase apps.

From the repository root:

```bash
pnpm --filter @nocobase/app-host build
APP_DIST_DIR="$PWD/packages/app-host/fixtures/app-dist" pnpm --filter @nocobase/app-host start
```

The workspace start scripts use `tsx` because internal package exports resolve
to TypeScript source during monorepo development. Published package exports
resolve to compiled JavaScript instead.

By default the host listens on `127.0.0.1:3000` and discovers apps from
`./app-dist` in the current working directory.

The package fixture shows the supported single-level `app-dist` layout:

```text
packages/app-host/fixtures/app-dist/
  demo/
    package.json
    dist/client/index.html
    dist/client/assets/...
    dist/server/embedded.js

  service/
    package.json
    dist/server/embedded.js

  koa/
    package.json
    dist/server/embedded.js
    dist/server/koa-fetch-adapter.js

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
```

The public URL is also a single level:

```text
http://127.0.0.1:3000/demo/
http://127.0.0.1:3000/demo/assets/demo.js
http://127.0.0.1:3000/demo/api/info
http://127.0.0.1:3000/service/healthz
http://127.0.0.1:3000/koa/api/info
http://127.0.0.1:3000/koa/redirect
http://127.0.0.1:3000/koa/stream
http://127.0.0.1:3000/lifecycle/
http://127.0.0.1:3000/lifecycle/api/lifecycle
http://127.0.0.1:3000/ws-demo/
http://127.0.0.1:3000/ws-demo/api/info
ws://<host>/ws-demo/ws
```

`dist/server/embedded.js` is the standard app runtime entrypoint and is required
for discovery. `dist/client/assets/**` is the optional static asset directory
that can be served by Nginx, CDN, object storage, or the host fallback.

Route ownership is intentionally narrow:

```text
/<app>/assets/*  -> dist/client/assets/*
/<app>/*         -> dist/server/embedded.js
```

The server receives the path after the `/<app>` mount point, so
`/demo/api/info` is dispatched as `/api/info` and `/demo/dashboard` is dispatched
as `/dashboard`.

`dist/client/index.html` is not a host fallback artifact. If an app wants to
serve a SPA shell, its `dist/server/embedded.js` should read and return that
HTML. This keeps HTML, API, SSR, redirects, auth callbacks, and ordinary server
routes under the app's own runtime.

Server artifacts should export `createServer(scope)`. The host still accepts
`createApp(scope)`, `default(scope)`, `createApp()`, and the old
`createApi(scope)` export during the v3 transition.

The returned app object should expose `fetch(request)` and may expose
`websocket(request)`. App-created resources should be released through
`scope.registerDisposer(name, dispose)`.

The `lifecycle` fixture is a complete lifecycle example. It registers a
`scope.onBeforeDestroy(...)` hook, registers a `scope.registerDisposer(...)`
cleanup function, and implements the actual `dispose()` logic.

The `ws-demo` fixture exposes a WebSocket clock stream. Its client derives the
public URL from the current page origin, so `ws://<host>/ws-demo/ws` maps to
`/ws` inside the embedded app.

The `koa` fixture adapts a real `koa.callback()` to the host's Fetch contract
through an ephemeral loopback HTTP server. It demonstrates Koa middleware,
request bodies, redirects, cookies, streaming responses, and lifecycle cleanup.
See `fixtures/app-dist/README.md` for the adapter's HTTP-only boundary.
