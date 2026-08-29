# Server Development Guide

Use this guide when changing the default app server. The template is an
explicit composition root; reusable runtime and HTTP mechanics belong in
`@nocobase/app-server-kit`, while domain behavior belongs in its owning package
or app plugin.

## Mental Model

- `app.ts` creates the NocoBase `Application` and declares its providers in
  dependency order. Hono is only the Router service exposed as `app.router`.
- `runtime.ts` declares config factories, explicit server plugins, providers,
  and routes through `defineAppRuntime()`. The application package name comes
  from `rootDir/package.json`, and generic standalone mount defaults belong in
  `@nocobase/app-server-kit/node`.
- `config/*` owns application-specific defaults, environment mapping, and the
  final composition of package-owned config sections. Generic Scope, path,
  plugin, and config resolution belongs in `@nocobase/app-server-kit`.
- `embedded.ts` is the app-host entry. It resolves config, creates the
  application, binds shutdown to the host scope, starts providers, and returns
  the ready application.
- `standalone.ts` adapts the same embedded entry to Node HTTP. Generic Node
  standalone scopes, environment-file loading, serving, WebSocket upgrades,
  process signals, draining, and forced shutdown live in
  `@nocobase/app-server-kit/node`.
- Shared scope paths, routing, cancellation, mount adapters, and application
  lifecycle helpers live in `@nocobase/app-server-kit/runtime`.
- Plugin server behavior is explicitly registered through `server/plugins.ts`.
  Each package exports one `server/plugin.ts` definition. Providers own service
  lifecycle; API and root routes are separate contributions.

The template must not grow demo APIs, generic repositories, or compatibility
layers for the removed `deps`, `services`, `bootstrap.ts`, and separately
loaded route protocols. Put new domain APIs in a plugin package.

Standalone entrypoints convert their own `import.meta.dirname` to `rootDir`
and pass it into scope/config creation. Scope factories must not infer paths
from the location of their implementation module. Explicit `paths` override
the template layout derived from `rootDir`.

## Runtime Contract

Standalone and embedded modes both enter through `createServer(scope)`.
`resolveAppRuntime(appRuntime, scope)` resolves routing, paths, plugins, and the
runtime-ready application config before `createApp()` assembles the application;
`startApplicationInScope()` binds cleanup and starts its Provider lifecycle.

Node-only server entrypoints use `defineStandaloneServer()` from
`@nocobase/app-server-kit/node` to bind their root directory, Runtime
Definition, and shared `createServer(scope)` factory. The resulting create and
start operations own standalone Scope creation, Vite overrides, public-path
mounting, Node listen configuration, and lifecycle cleanup. Config-only
entrypoints and database tasks use `resolveStandaloneAppRuntime()`, initialize
the runtime `appConfig`, and read the required typed config token. Use
`createStandaloneRuntimeScope()` only when direct Scope
lifecycle access is required. Do not add template-local Scope or config-loading
facades around these APIs.

| Mode       | Public base path | App-local incoming path            | Public API URL         |
| ---------- | ---------------- | ---------------------------------- | ---------------------- |
| standalone | `APP_BASE_PATH`  | `/settings` from `/<app>/settings` | `<base-path>/api`      |
| embedded   | `scope.basePath` | `/settings` after host stripping   | `<scope.basePath>/api` |

Do not prefix app-local routes with the public mount path. The mount adapter is
responsible for stripping and restoring that path.

## Adding Server Behavior

1. Prefer a focused app plugin with one `server/plugin.ts` entry.
2. Register typed services in Provider `register()` and HTTP routes through
   explicit `apiRoutes` or `rootRoutes`.
3. Resolve cross-package dependencies through exported ServiceTokens.
4. Keep long-lived start/stop behavior in `start()` and `shutdown()`.
5. Add tests under the package root `tests/` directory.

Application config stays explicit under `config/*`. Package-owned config
normalizers and composition helpers should be reused rather than copied into
the template. Do not read `process.env` in providers or routes.

## Validation

Run at least:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Use `pnpm server:config` to inspect resolved standalone values when debugging
paths, proxy targets, database sources, or SPA behavior.
