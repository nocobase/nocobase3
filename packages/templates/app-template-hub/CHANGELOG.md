# @nocobase/app-template-hub

## 1.0.0-beta.1

### Major Changes

- 174eab5: Consolidate the browser packages into `@nocobase/app-client`.

  `@nocobase/app-sdk` is gone; its API client now lives in `@nocobase/app-client` and is imported from there. `@nocobase/app-portal-sdk` is deprecated and keeps only what still has consumers: `NocoBaseClient` and the runtime configuration it reads, which exist to reach a v2 NocoBase server, and the route surface containers under `/routing`. Its ACL, auth, data, extension, i18n, and system-settings modules are removed, as is the route tree that `/routing` used to export alongside the surfaces.

  `@nocobase/app-client` gains `resolveAppBase()`, which reports the path the application is mounted at.

  Four plugins built their API client at import time instead of resolving it from the application's service container, so they could not see `api.baseURL` from the application configuration. They now resolve it, which means an application that configures a base URL gets one client rather than two that disagree.

  The injected browser global `NOCOBASE_PORTAL_BASE` is renamed to `APP_BASE_PATH`. Its value has always been the `APP_BASE_PATH` environment variable, and the old name grouped it with the settings that address a v2 NocoBase server. Those keep their names. A client and the server that serves it must be upgraded together.

  `@nocobase/app-plugin-data-provider` is removed. It forwarded the Portal data provider, and applications built on the current client runtime do not use it.

  The Hub template is rebuilt from the default template and now runs the same client and server stack as every other v3 application. Its `/api/apps` endpoint and its v2 API proxy are gone, so a hub's `.env` no longer configures them.

  The Portal SDK's template compatibility check is removed with the rest: it had been disabled behind a constant, and its install script cost every generated project a `pnpm-workspace.yaml` `allowBuilds` entry it did not need. `createPortalViteConfig` no longer takes the plugin that injected it.

- 174eab5: Remove the shadcn Registry both templates shipped. Its recipes were written against the Portal SDK modules that no longer exist — ACL, extensions, routing, i18n, and system settings — so materializing one into an application would have installed code that cannot compile. The Registry the authentication plugin publishes is unaffected, and `client/extensions/nocobase-auth-ui` stays where it is.

### Minor Changes

- ab7b341: Add `defineDevRoutes()`, for pages that exist only while developing an application.

  It takes the same shape as `defineSettingsRoutes()` — pages, one level of groups, `navigation` and `access` — and mounts under `/dev` instead of `/settings`. The two are separate path spaces, so the same relative path may appear in both and resolve to `/settings/orders` and `/dev/orders`.

  What makes it different is that nothing it declares reaches a production bundle. The guard lives inside `defineDevRoutes()` rather than at each call site, so a plugin author calls it unconditionally the way they call `defineSettingsRoutes()` and cannot forget it. A production build replaces `import.meta.env.PROD` with `true`, which makes the argument unreachable and lets the bundler drop the page components behind it, along with any module only those pages import. The templates guard their `/dev` route and the dev entry in the header the same way, so a production build carries no dev route, no dev layout chunk, and no dev entry point.

  This draws its boundary at the build output, not at runtime permissions. A page that has to exist in production but be restricted by role is still a Settings Route with `access`, enforced by the server.

  Both templates' headers offer a dev entry beside the settings gear, visible only during development. A surface withdraws its own entry: the settings centre shows the dev entry but not the gear, the dev tools show the gear but not the dev entry, and the application shell shows both.

  Both templates gain a `client/layouts/` directory. The settings centre's chrome — the navigation rail, group disclosures, the mobile page select, and the per-page access filtering — is now one `SurfaceLayout` that the settings centre and the dev tools each render with their own copy, rather than a second copy of the same layout. The Hub template's settings navigation picks up the translation the default template already had.

  `client:inspect` reports the resolved dev routes and accepts `--type dev-routes`.

### Patch Changes

- ab7b341: Fix `client:inspect`, which failed with `.glob is not a function`.

  The command runs under tsx and imported the application's client declaration modules directly. Those modules are written for a bundler: `client/source-extensions.ts` calls `import.meta.glob()`, which only a bundler implements. This surfaced once `client/runtime.ts` began importing source extensions — before that the inspector never reached a module that needed one.

  Declarations now load through Vite, so aliases such as `@/` and compile-time `define` constants resolve exactly as they do in a real build, rather than being an approximation the inspector maintains separately. The environment is configured to transform modules and nothing else — no HMR, websocket, file watching, or dependency pre-bundling — because each of those leaves a handle open that stops the command from exiting once it has printed its result. The server is closed on every path, including failures.

  The tests missed this because they run under Vitest, which is built on Vite and therefore implements `import.meta.glob` — the declaration modules loaded fine there while the real command was broken. `client:inspect` is now also exercised as a child process under tsx, the way a developer runs it, and that test fails if the loader regresses or if the command stops exiting on its own.

## 0.1.0-beta.0

### Minor Changes

- 1b5f10f: Rename the Hub template package from `@nocobase/hub` to `@nocobase/app-template-hub`, so it matches the naming the other v3 templates already use and reads as the template it is rather than as the Hub runtime itself.

  This is a breaking rename with no compatibility shim: `@nocobase/hub` will not receive further releases, and nothing is published under the old name from here on. The new package starts its version history over rather than continuing the old one, so a dependency on `@nocobase/hub` has to be repointed by hand. `nb3 hub create` now defaults to the new package, which means an older `nb3` still downloads the old name and pins whatever `@nocobase/hub@beta` last resolved to.

### Patch Changes

- 1b5f10f: Accept `--template hub` in `create-app`, and scaffold a hub as a hub rather than as an app.

  A hub has no database, so the app flow was wrong for it in every step that touches one: it would have asked which dialect to use, added a driver dependency the hub never loads, and written a `config.yml` the hub never reads. A template now declares what it is through `nocobase.templateKind`, and `create-app` reads that to decide which flow applies — falling back to the package name so a local path to a checkout predating the field still works. The kind is settled after the template is downloaded, because a package specifier or a local path does not reveal it any earlier.

  A generated hub gets the scaffolding `nb3 hub create` already produced: `.env` derived from the template's `.env.example` with `APP_NAME` set to the project name, `.nb3/hub.json` so the `nb3 hub` commands can find it, `app-dist/` for the apps it serves, the runtime directories it writes into, and the matching `.gitignore` entries. `--db-dialect` is reported as ignored rather than silently dropped when it is passed alongside a hub template.

The versions below were published as `@nocobase/hub`, the name this package carried until it was renamed to
`@nocobase/app-template-hub`. They are kept because they describe this same codebase; the `@nocobase/hub` releases
they name are not, and never will be, versions of `@nocobase/app-template-hub`.

## 0.0.1-beta.4 (as @nocobase/hub)

### Patch Changes

- 7cdffbd: Add declarative application Runtime Definitions, shared application Scope, path, and disposal contracts, reusable Node standalone Scope and environment loading utilities, and focused Runtime Config section resolution. Resolve plugins before config factories and pass the complete resolved Runtime into application assembly, making Runtime plugins the single source for both configuration contributions and provider or route registration. Use the shared Runtime assembly across app-host and the default application template so embedded and standalone modes no longer maintain separate structural copies. Remove the template-local Scope and config-loading infrastructure, require standalone entrypoints to pass their resolved application root explicitly, and remove the legacy `/v2/api` proxy contract in favor of each application's local `/api` router.

## 0.0.1-beta.3 (as @nocobase/hub)

### Patch Changes

- 8fb9319: Declare the pnpm version this package is developed with, so working on it uses the same pnpm as the rest of the monorepo.

## 0.0.1-beta.2 (as @nocobase/hub)

### Patch Changes

- 0465323: Introduce the plugin-based authorization core and permission management UI. Replace the previous authorization API with composable core, database, permission-set, default-access, sharing-rule, restriction-rule, and page plugins; add route access metadata to the application client; publish and enable the authorization app plugin in the default template; and correct the Hub documentation to use the v3 Portal SDK package name.
- 0465323: Declare explicit publish files for the example plugins and Hub template, and add a safe Hub environment example for generated projects.

## 0.0.1-beta.1 (as @nocobase/hub)

### Patch Changes

- 89fc34a: Upgrade Agent Annotations to version 0.1.5 and prevent its runtime files from triggering repeated Vite page reloads.

## 0.0.1-beta.0 (as @nocobase/hub)

### Patch Changes

- da1b1b0: 首次发布。
