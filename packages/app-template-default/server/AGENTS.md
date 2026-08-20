# Server Development Guide

Use this guide when changing the app server. Keep server changes small and
verify them at the route, service, and configuration boundary that changed.

## Mental Model

- `app.ts` is the app-local composition root. It wires Hono routes, the
  NocoBase API proxy, local app APIs, and the SPA asset/index handlers.
- `runtime/*` is the shared runtime layer. Keep config loading, runtime
  preparation, and app creation there when both standalone and embedded need
  the behavior.
- `standalone.ts` is an adapter. It starts the app as its own HTTP server,
  reads `.env`, `.env.local`, and `process.env`, then strips the public base
  path before dispatching to the app-local server.
- `embedded.ts` creates a server for an app-host scope. It reads `dist/.env`
  and scope-provided config. App-host has already stripped the public base path
  before requests reach the app-local server.
- `config/*` owns environment parsing and defaults. Prefer adding config there
  instead of reading `process.env` in routes or services.
- `routes/*` owns HTTP shape. Keep business logic in `services/*`.
- `migrations/*` owns database shape. Add or update a focused migration when a
  service needs durable storage.

## Runtime Contract

Standalone and embedded may differ only in their adapter layer. After adapter
normalization, app routes, SPA runtime globals, API proxy behavior, database
setup, migrations, and services must use the shared runtime path.

| Mode | Public base path | App-local incoming path | Internal base path | Public API URL | Internal proxy route |
| --- | --- | --- | --- | --- | --- |
| standalone | `APP_BASE_PATH` | `/settings` from `/<app>/settings` | app-local root (`''`) | `<APP_BASE_PATH>/v2/api` | `/v2/api` |
| embedded | `scope.basePath` | `/settings` from `/<app>/settings` | app-local root (`''`) | `<scope.basePath>/v2/api` | `/v2/api` |

`APP_BASE_PATH` and `scope.basePath` are public mount paths. Do not use them as
app-local route prefixes. App-local routes should be written as `/api/*`,
`/v2/api/*`, `/assets/*`, and `/*`.

`NOCOBASE_API_PROXY_TARGET` is always the upstream NocoBase REST API root and
must include the upstream `/api` suffix when proxying real NocoBase requests.
Standalone app identity is derived from `APP_BASE_PATH`. Embedded app identity
comes from `scope.appName ?? scope.id`.

When adding runtime behavior, put it under `runtime/*` when both modes need it.
Do not duplicate database preparation, migration execution, SPA runtime
injection, or app service creation in `standalone.ts` and `embedded.ts`.

Run `pnpm server:config` to inspect the resolved standalone values before
debugging path, proxy, database, or SPA index issues.

## Adding A Local API

1. Add request and response logic under `server/routes`. Keep the public JSON
   shape stable and simple.
2. Put database or integration logic in `server/services/<feature>.ts`.
3. Register the service from `server/services/index.ts`.
4. Wire the route from `server/routes/api.ts`, or create a focused route module
   when the file would become hard to scan.
5. Add a node test under `tests/logic`. Prefer `createApp()` with a small fake
   service or fake `DatabaseManager` for local API behavior.
6. Run `pnpm test -- tests/logic/app-server.test.ts` for route/proxy/SPA
   behavior, and add `tests/logic/config.test.ts` when config or
   migrations changed.

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

1. Create a migration under `server/migrations` with a timestamped name.
2. Keep `up` and `down` focused on one schema change.
3. Add a service that uses the configured `DatabaseManager`; do not open an
   extra database connection inside the service.
4. Add or update tests that validate the migration loader and service query
   behavior.

## Proxy And SPA Runtime Rules

- Keep NocoBase upstream proxy behavior and generic fetch proxy behavior in
  `@nocobase/app-server/proxy`.
- Preserve forwarded headers, referer/origin rewriting, and hop-by-hop header
  removal when changing proxy code.
- SPA runtime globals are created in `server/spa/runtime-globals.ts` and
  injected by `@nocobase/app-server/spa`.
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
