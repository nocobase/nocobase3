# @nocobase/app-template-hub

## 1.0.0-beta.5

### Patch Changes

- 15c77a6: Move Workflow source parsing and Artifact generation behind the `workflow build` command while retaining the public build API for applications with custom Instructions. The command uses Node's native TypeScript loading in a disposable process and removes esbuild entirely. CLI build modules remain in the published package, but production servers do not load them or TypeScript at runtime.

## 1.0.0-beta.4

### Minor Changes

- 813da59: Rewrite the template's package name into the generated application's own, in `client/runtime.ts`, `client/service-provider.ts`, and `server/providers/app-example.ts`, and set `displayName` to the application name instead of dropping it. The client previously declared an i18n namespace the server did not share, and `pnpm client:inspect` refused to run because the two disagreed.
- 813da59: Install the deployable `dist/` with pnpm rather than npm, and add the database driver the application declares to `dist/package.json`. The driver was missing from that manifest, so a deployment installed no driver at all and failed on its first query.
- 813da59: Ship `.prettierignore` in the published package, so `pnpm format:check` in a generated application does not fail on the lockfile.
- 813da59: Discover tests with a glob instead of a hand-maintained list of filenames, and pass an empty run so `pnpm test` works in a generated application, which ships no tests. The list named a file that no longer existed while several real test files were absent from it and were never run; those covering removed sources are deleted.

### Patch Changes

- 43d5bf0: Publish the application-owned AI Employee frontend Registry with its chat components. Plugin-owned development showcases now live under `client/dev`, outside the materialized Registry item, and are excluded from production application builds. The Registry uses the application-scoped `@nocobase/app-client` transport for JSON, upload, and streaming requests instead of the deprecated Portal SDK client. The Default and Hub templates scan plugin Registry source for Tailwind utilities, so materialized components retain their intended responsive layout and sizing.
- 813da59: Declare browser-only packages as devDependencies rather than dependencies, and make `react-i18next` an optional peer of `@nocobase/i18n` provided by `@nocobase/app-client`. Client code is bundled by the consuming application, so these entries did nothing for the bundle while `dist/package.json` pulled every one of them into the server deployment to be installed and never required.
- 813da59: Build the workspace packages a template depends on by selecting them with pnpm rather than listing them by hand, and drop the unused `Dockerfile`. The hand-written list had drifted: `@nocobase/config` was missing from it, so building a template on its own failed at "Generate server package".
- 813da59: Add `pnpm deps:check`, which fails when server code imports a package declared only in devDependencies. That mistake resolves in every development checkout and is absent exactly once, on the deployed server, where it surfaces as a bare `Cannot find package`.

## 1.0.0-beta.3

### Patch Changes

- 66dba5d: Pass the complete client plugin composition to `defineAppRuntime()`.

  The runtime now resolves plugin route component overrides from the same `AppClientPlugins` object as every other plugin contribution, while application route overrides remain a separate declaration.

  The Client Application now validates the auth provider and guest login route required by authenticated routes internally, keeping those details out of application composition roots.

## 1.0.0-beta.2

### Minor Changes

- 6f9b399: Rewrite the template's agent and human documentation around building an application rather than developing a plugin. `README.md` now describes the project structure, how to run it, and what each of its own pnpm scripts does; `AGENTS.md` describes how to build a feature — pages, shadcn/ui components, endpoints, database access, migrations, and translations — and routes to a new `skills/nocobase-app-development/` skill whose references carry the detail. The nested `client/AGENTS.md` and `server/AGENTS.md` are rewritten to match: the server guide previously told agents to put new domain APIs in a plugin package, the opposite of what an application scaffold should say, and the client guide was largely about a `client-old/` directory that no longer exists.

  The page-to-sidebar path is now written down. Declaring a route makes the URL work but leaves the page out of navigation, which needs a Refine resource registered in `client/service-provider.ts`; the documentation previously described only the route half, so a page added by following it would have been unreachable from the sidebar. The guidance also now separates the directories business code belongs in from the framework scaffolding the template replaces on upgrade, and asks that both be updated together when an application changes that structure.

  The authorization Skill moves from `@nocobase/authorization` to `@nocobase/app-plugin-authorization` and is renamed `nocobase-app-plugin-authorization`. Skills synchronize from registered plugins, so one published by a library could never reach an application; its example also imported `@nocobase/authorization/database`, which an application does not depend on, and now imports the types the plugin re-exports.

  The guidance now points at the plugins an application already has. A prompt asking for approvals, notifications, or per-user record access was answerable only by building those from scratch, because nothing told an agent that `app-plugin-workflow`, `app-plugin-notification`, and `app-plugin-authorization` are installed and publish their own Skills — `.agents/skills/` was described only as generated output not to edit. Server route guidance also covered `can()` but not `authorize()`, so an ownership rule like "a salesperson sees only their own customers" had no documented path other than filtering rows in memory after fetching them, and scheduled work had no guidance at all.

  Application-owned migrations now reach the build. `database/migrations` and `database/seeds` exist in the template, and `tsconfig.server.json` compiles `database/**/*.ts`, so a migration an application writes is typechecked and emitted to `dist/database/` — which `scripts/build-server-dist-package.mjs` already expected to find. `pnpm migrate` applied such a migration before this change, but `pnpm build` silently dropped it. The unreferenced `tsconfig.migrations.base.json` is removed.

  `app-template-hub` receives the same framework-level change, since it is the same application scaffold with a different product identity: the rewritten documentation and the `nocobase-app-development` Skill, `CLAUDE.md`, and the migration build fix, which it had the identical version of. The repository `AGENTS.md` now records that framework changes to one template belong in the other by default, with the parts that stay template-specific.

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
