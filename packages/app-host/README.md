# @nocobase/app-host

Standalone runtime host for NocoBase apps.

From the repository root:

```bash
pnpm --filter @nocobase/app-host build
APP_DIST_DIR="$PWD/packages/app-host/fixtures/app-dist" pnpm --filter @nocobase/app-host start
```

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

  lifecycle/
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
http://127.0.0.1:3000/lifecycle/
http://127.0.0.1:3000/lifecycle/api/lifecycle
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

The `lifecycle` fixture is a complete lifecycle example. It registers a
`scope.onBeforeDestroy(...)` hook, registers a `scope.registerDisposer(...)`
cleanup function, implements the actual `dispose()` logic, and returns that
same function as `app.close`.
