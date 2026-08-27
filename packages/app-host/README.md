# @nocobase/app-host

Standalone runtime host for NocoBase apps.

From the repository root:

```bash
pnpm --filter @nocobase/app-host build
APP_DIST_DIR="$PWD/packages/app-host/fixtures/app-dist" pnpm --filter @nocobase/app-host start
```

By default the host listens on `127.0.0.1:3000` and discovers apps from
`./app-dist` in the current working directory.

Set `APP_HOST_PUBLIC_URL` when the browser-facing root differs from the local
listener, for example `APP_HOST_PUBLIC_URL=https://apps.example.com/runtime/`.
It must be an absolute `http://` or `https://` URL without embedded credentials;
invalid values prevent App Host from starting.
The control API returns each App's resolved `accessUrl`; Hub and other clients
must consume that value instead of constructing public URLs themselves.

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
cleanup function, implements the actual `dispose()` logic, and returns that
same function as `app.close`.

The `ws-demo` fixture exposes a WebSocket clock stream. Its client derives the
public URL from the current page origin, so `ws://<host>/ws-demo/ws` maps to
`/ws` inside the embedded app.

## Managed releases

Immutable releases live below the app directory:

```text
app-dist/orders/releases/release-v1/
  app-release.json
  package.json
  dist/server/embedded.js
  dist/client/...
```

Hub installs a Release through the protected streaming upload endpoint:

```text
POST /__apps/:appId/releases
Content-Type: application/gzip
X-NocoBase-Release-Id: <releaseId>
Authorization: Bearer <APP_HOST_CONTROL_TOKEN>
```

The archive may contain only `app-release.json`, `package.json`, and `dist`.
App Host rejects unsafe paths, links, invalid identities, checksum mismatches,
oversized archives, and excessive expansion before atomically renaming the
staging directory into the immutable Release path. Identical uploads return
`unchanged`; reusing a Release ID for different content returns a conflict.

Default limits can be overridden for a trusted deployment environment:

```env
APP_HOST_MAX_RELEASE_ARCHIVE_BYTES=536870912
APP_HOST_MAX_RELEASE_EXTRACTED_BYTES=1073741824
APP_HOST_MAX_RELEASE_ENTRIES=100000
```

Deploy a release through the control API:

```bash
curl -X POST http://127.0.0.1:3000/__apps/orders/deploy \
  -H 'content-type: application/json' \
  -d '{"releaseId":"release-v1"}'
```

The host verifies the artifact checksum and readiness before promotion. It then
atomically records the active release in
`APP_DIST_DIR/.app-host/active-releases.json` before switching traffic. A
failed readiness check or state write leaves the previous runtime active. On
restart, the host verifies the persisted checksum again and restores every
recorded release before opening its listening socket. Invalid state or replaced
release content therefore fails closed.

Rollback uses the same promotion path:

```bash
curl -X POST http://127.0.0.1:3000/__apps/orders/rollback \
  -H 'content-type: application/json' \
  -d '{"releaseId":"release-v1"}'
```
