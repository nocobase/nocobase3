# @nocobase/app-portal-sdk

> **Deprecated.** This package is kept only so v3 code can reach a **v2 NocoBase API**. Its `NocoBaseClient` carries the v2 authentication semantics — a Bearer token held in browser storage, `X-Authenticator` and `X-Role` headers, and the `resource:action` endpoint shape — while a v3 application talks to its own server over cookies. The two are not interchangeable. New code uses [`@nocobase/app-client`](../app-client), and nothing new should be added here.

What remains serves integrations that still call v2 APIs, including the AI Knowledge Base upload flow: the client, its session storage and error types, and the runtime configuration that resolves URLs against the `NOCOBASE_*` environment a Portal build injects. The v3 File plugin no longer depends on this package. Everything else the Portal architecture used to publish — authentication providers, the Refine data provider, ACL, routing, extensions, i18n, system settings, and the Vite plugins — has been removed.

Use documented package exports only. Imports from `src/` are not public API.

## Entry points

- `@nocobase/app-portal-sdk/client` — `NocoBaseClient` for a v2 NocoBase API, its session storage, and HTTP error types.
- `@nocobase/app-portal-sdk/runtime` — Portal base, v2 API URL, and settings and callback URL resolution.

## Workspace development

The workspace manifest resolves both entry points directly from `src/`, so a consuming Vite process compiles and watches changes without a separate watcher. During `pnpm pack` and `pnpm publish`, pnpm applies `publishConfig.exports` and rewrites them to the compiled `dist/` files.
