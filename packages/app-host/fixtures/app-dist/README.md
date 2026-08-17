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
```
