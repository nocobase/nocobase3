# Server Development Guide

Use this guide when changing the app server. Keep server changes small and
verify them at the route, service, and configuration boundary that changed.

## Mental Model

- `app.ts` is the app-local composition root. It creates the NocoBase
  `Application` and wires routes, the NocoBase API proxy, local app APIs, and
  the SPA asset/index handlers. Hono is the Router service resolved through
  `routerToken`; do not treat or name a Hono instance as the Application.
- `runtime/*` is the shared runtime layer. Keep config loading and app
  creation there when both standalone and embedded need the behavior.
- `standalone.ts` is an adapter. It creates a `StandaloneScope`, calls the same
  `createServer(scope)` entry used by app-host, starts the app as its own HTTP
  server, then strips the public base path before dispatching to the app-local
  server. `StandaloneScope` owns standalone paths, environment, cancellation,
  and disposer execution.
- `embedded.ts` creates a server for an app-host scope. It reads `.env` and
  `.env.local` from the resolved app root, then applies scope-provided config.
  App-host has already stripped the public base path before requests reach the
  app-local server.
- `config/*` owns environment parsing and defaults. Prefer adding config there
  instead of reading `process.env` in routes, repositories, or providers.
- `routes/*` owns HTTP shape. Keep persistence boundaries in `repositories/*`
  and register runtime capabilities through `providers/*`.
- `../database/migrations/*` owns database shape. Add or update a focused migration when a
  service needs durable storage.

## Runtime Contract

Standalone and embedded may differ only in their adapter layer. After adapter
normalization, app routes, SPA runtime globals, API proxy behavior, database
setup, migrations, and services must use the shared Application and Provider
path.

Both modes enter the application through `createServer(scope)`. Do not add
module-location parameters to that factory. App-host supplies its runtime
scope; the standalone adapter supplies `StandaloneScope`. Direct ESM startup
uses `import.meta.main`; entrypoint detection must not be coupled to path
resolution.

| Mode       | Public base path | App-local incoming path            | Internal base path    | Public API URL            | Internal proxy route |
| ---------- | ---------------- | ---------------------------------- | --------------------- | ------------------------- | -------------------- |
| standalone | `APP_BASE_PATH`  | `/settings` from `/<app>/settings` | app-local root (`''`) | `<APP_BASE_PATH>/v2/api`  | `/v2/api`            |
| embedded   | `scope.basePath` | `/settings` from `/<app>/settings` | app-local root (`''`) | `<scope.basePath>/v2/api` | `/v2/api`            |

`APP_BASE_PATH` and `scope.basePath` are public mount paths. Do not use them as
app-local route prefixes. App-local routes should be written as `/api/*`,
`/v2/api/*`, `/assets/*`, and `/*`.

`NOCOBASE_API_PROXY_TARGET` is always the upstream NocoBase REST API root and
must include the upstream `/api` suffix when proxying real NocoBase requests.
Standalone app identity is derived from `APP_BASE_PATH`. Embedded app identity
comes from `scope.appName ?? scope.id`.

When adding shared composition behavior, put it under `runtime/*` or the
Provider that owns the capability. Do not duplicate database preparation,
migration execution, SPA runtime injection, or app service creation in
`standalone.ts` and `embedded.ts`. AppRuntime only carries resolved config and
paths; service creation and cleanup belong to ServiceProviders.

Run `pnpm server:config` to inspect the resolved standalone values before
debugging path, proxy, database, or SPA index issues.

## Adding A Local API

1. Add request and response logic under `server/routes`. Keep the public JSON
   shape stable and simple.
2. Put database persistence boundaries in `server/repositories/<feature>.ts`.
3. Register the repository or runtime capability through a focused
   `ServiceProvider` in `server/providers/<feature>.ts`.
4. Wire the route from `server/routes/api.ts`, or create a focused route module
   when the file would become hard to scan.
5. Add a node test under `tests/logic`. Prefer `createApp()` with a small fake
   service or fake `DatabaseManager` for local API behavior.
6. Run `pnpm test -- tests/logic/app-server.test.ts` for route/proxy/SPA
   behavior, and add `tests/logic/config.test.ts` when config or
   migrations changed.

## Workflow Or Backend Code

Put persistence boundaries in `server/repositories/<feature>.ts` and expose
them through `server/routes/*`. Register long-lived runtime capabilities with
a focused ServiceProvider and typed token. Routes own HTTP request and response
shapes; feature modules own calculations, validation, and integration calls.

Use a Workflow when at least one of these is true:

- execution must wait for a person, an external event, or a scheduled time;
- execution must persist intermediate state and continue after a process restart;
- a business user or auditor must inspect the current step, chosen branch, or
  reason for the execution path;
- the operation has several durable steps whose progress, retry, or recovery
  must be managed independently.

Use a Service + Route when all work completes in one call and no durable
intermediate state is required. Typical examples are pure calculations, data
conversion, field validation, one database transaction, and one outbound API
call. Business logic may raise a custom Workflow event through
`workflowService.trigger(workflowKey, context)` when it needs to start a longer
asynchronous process. Manual execution is a separate operational capability
available to every Workflow; it is not a trigger type.

If the deciding question is “where is this operation now, why did it take this
branch, and what must happen next?”, choose Workflow. If the answer is simply
the function's return value, choose Service + Route.

## Adding Server Config

- Add app-facing values to `server/config/app.ts`.
- Add HTTP listener and development proxy values to `server/config/server.ts`.
- Add browser-injected SPA runtime values to `server/config/spa.ts`.
- Add database connection or migration values to `server/config/database.ts`.
- Do not read `process.env` outside the config loading boundary unless the
  value truly belongs to the process runtime itself.
- Update `scripts/server-config.ts` when a new value should appear in the
  diagnostic output.

## Adding Storage

1. Create a migration under `database/migrations` with a timestamped name.
2. Keep `up` and `down` focused on one schema change.
3. Add a repository that uses the configured `DatabaseManager`; do not open an
   extra database connection inside the repository.
4. Add or update tests that validate the migration loader and repository query
   behavior.

## Proxy And SPA Runtime Rules

- Keep NocoBase upstream proxy behavior and generic fetch proxy behavior in
  `@nocobase/app-server-kit/proxy`.
- Preserve forwarded headers, referer/origin rewriting, and hop-by-hop header
  removal when changing proxy code.
- SPA runtime globals are created in `server/spa/runtime-globals.ts` and
  injected by `@nocobase/app-server-kit/spa`.
  They are part of the browser SDK contract, not ordinary HTML decoration.
- Static SPA assets must be served before the SPA fallback and missing assets
  must return JSON `404`, not the SPA index.

## Useful Commands

```bash
pnpm server:config
pnpm server:config -- --json
pnpm test -- tests/logic/app-server.test.ts tests/logic/config.test.ts
pnpm typecheck
```
