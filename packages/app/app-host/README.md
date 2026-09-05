# @nocobase/app-host

Standalone runtime host for NocoBase apps.

From the repository root:

```bash
pnpm --filter @nocobase/app-host build
APP_DEPLOYMENTS_DIR="$PWD/packages/app/app-host/fixtures/app-dist" pnpm --filter @nocobase/app-host start
```

The workspace start scripts use `tsx` because internal package exports resolve
to TypeScript source during monorepo development. Published package exports
resolve to compiled JavaScript instead.

By default the host listens on `127.0.0.1:3000` and discovers deployed apps
from `./storage/app-deployments` in the current working directory.

The CLI loads the `host` namespace once at startup. It accepts `.yml`, `.yaml`,
and `.json` files. Set `APP_HOST_CONFIG_PATH` to an explicit file or extensionless
path; otherwise the host discovers `config.yml`, `config.yaml`, or `config.json`
in that order. Environment variables override file values.

```yaml
host:
  mode: standalone
  server:
    host: 127.0.0.1
    port: 3000
  artifact:
    driver: fs
    location: ./storage/app-artifacts
    visibility: private
  logging:
    level: info
  appDeploymentsDir: ./storage/app-deployments
  appVolumesDir: ./storage/app-volumes
```

The host owns its logging lifecycle. In production, the default rolling-file
transport writes structured logs to `storage/host/logs/{logger}.log`; outside
production, logs go to stdout. Set `host.logging` or `APP_HOST_LOG_LEVEL` to
override the logging configuration.

The directories have separate lifecycles:

```text
storage/
  app-artifacts/             immutable release archives
  app-deployments/<appId>/   standalone package or managed revision cache
  app-volumes/<appId>/       persistent config.yml/yaml/json and storage/
```

## Host modes

The host defaults to `standalone` mode. It discovers local app definitions and
activates an app lazily when its first request arrives.

```bash
APP_HOST_MODE=standalone app-host
```

`managed` mode is intended for a Hub-controlled host. It does not register apps
from the local directory, and its application HTTP server does not expose the
app management endpoints. Only minimal liveness and readiness probes remain on
that server; management uses a private transport.
The Hub supplies complete host deployment sets over an authenticated
Node IPC channel. Each artifact reference identifies one immutable `.tar.gz`
object by Drive key, version, app ID, and SHA-256 checksum. The host reads that
object through its configured `@nocobase/drive` FS or S3 disk, verifies it,
expands it to the immutable
`app-deployments/<appId>/revisions/<sha256>` directory, prepares writable
storage at `app-volumes/<appId>/storage`, and reports reconciled state back to
the Hub. Each Runtime keeps the exact revision root it was started from, so an
old Runtime cannot observe the new Runtime's code or static assets while it is
draining. An installed-artifact marker lets later reconciliation of the same
Release checksum reuse the expanded directory without downloading, hashing, or
extracting the archive again. After a successful replacement, the Host retains
the three most recently used expanded revisions for fast rollback and prunes
older local revisions in the background. Deployment history and Release
artifacts have independent retention policies. Host logs report checksum,
extraction, discovery, activation, previous-runtime destruction, and cache
pruning durations so slow deployments can be attributed to a concrete phase.
For file configuration, the deployment set may select an absolute path or the default
`app-volumes/<appId>/config` path. Non-file configuration providers are handled
by the app and do not involve the host. Runtime replacement is stop-first with
bounded graceful request draining. If activation fails, the Host attempts to
recreate the previous Runtime from its unchanged definition and immutable
revision; this is not a guarantee of zero downtime for long-lived connections
or incompatible database migrations.

```bash
APP_HOST_MODE=managed app-host
```

The mode is fixed for the lifetime of the host process. A managed host never
falls back to standalone discovery when its Hub connection is unavailable.
The spawning supervisor automatically restarts an unexpectedly exited managed
host with bounded exponential backoff and replays its latest accepted deployment set.
The current runtime capability is `in-process`; Worker and Process backends can
be registered through the backend router contract but are not advertised until
their isolation runners are implemented.

The application Drive uses the App `storage` directory as its default private
filesystem disk. There is no default public filesystem disk or public storage
route; revisions remain immutable and contain no runtime-created storage links.

The package fixture shows the supported single-level deployment layout:

```text
packages/app/app-host/fixtures/app-dist/
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

The returned app object must implement `AppInstance` from
`@nocobase/app-server/runtime`: `fetch`, `config`, and optional `websocket`.
NocoBase `Application` implements this contract directly.
App-created resources should be released through
`scope.registerDisposer(name, dispose)`.

The host and App Server share this contract and its `ws`-backed Node adapter
through `@nocobase/app-websocket`. The Host imports App Server types only;
it does not load its runtime module. `management.reloadAppConfig(appId)`
calls the active instance's `config.reload()` under the per-App lifecycle
lock without replacing the runtime. It returns `null` for an inactive App
and does not activate it. Configuration reload errors propagate to the caller.

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
