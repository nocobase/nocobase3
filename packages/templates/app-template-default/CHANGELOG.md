# @nocobase/app-template-default

## 1.0.0-beta.14

### Minor Changes

- 813da59: Rewrite the template's package name into the generated application's own, in `client/runtime.ts`, `client/service-provider.ts`, and `server/providers/app-example.ts`, and set `displayName` to the application name instead of dropping it. The client previously declared an i18n namespace the server did not share, and `pnpm client:inspect` refused to run because the two disagreed.
- 813da59: Install the deployable `dist/` with pnpm rather than npm, and add the database driver the application declares to `dist/package.json`. The driver was missing from that manifest, so a deployment installed no driver at all and failed on its first query.
- 813da59: Ship `.prettierignore` in the published package, so `pnpm format:check` in a generated application does not fail on the lockfile.
- 813da59: Discover tests with a glob instead of a hand-maintained list of filenames, and pass an empty run so `pnpm test` works in a generated application, which ships no tests. The list named a file that no longer existed while several real test files were absent from it and were never run; those covering removed sources are deleted.

### Patch Changes

- 8d88ff4: Replace the public AI Employee LLM service filesystem loader with the application `config.yml` contract at `ai.llmServices`. Configured model entries use a simple label/value array and are converted internally to custom mode. The App plugin validates and synchronizes declarative service definitions at startup and on application-config reload while preserving repository-managed enabled state for matching services. The default App template includes a commented configuration example, and the App config validator supports unique object properties for rejecting duplicate service names.
- 43d5bf0: Publish the application-owned AI Employee frontend Registry with its chat components. Plugin-owned development showcases now live under `client/dev`, outside the materialized Registry item, and are excluded from production application builds. The Registry uses the application-scoped `@nocobase/app-client` transport for JSON, upload, and streaming requests instead of the deprecated Portal SDK client. The Default and Hub templates scan plugin Registry source for Tailwind utilities, so materialized components retain their intended responsive layout and sizing.
- 813da59: Declare browser-only packages as devDependencies rather than dependencies, and make `react-i18next` an optional peer of `@nocobase/i18n` provided by `@nocobase/app-client`. Client code is bundled by the consuming application, so these entries did nothing for the bundle while `dist/package.json` pulled every one of them into the server deployment to be installed and never required.
- cee3251: Add authenticated realtime subscriptions, refresh their identity after authentication changes, and invalidate in-app notification state through user-scoped events.
- 813da59: Build the workspace packages a template depends on by selecting them with pnpm rather than listing them by hand, and drop the unused `Dockerfile`. The hand-written list had drifted: `@nocobase/config` was missing from it, so building a template on its own failed at "Generate server package".
- 813da59: Add `pnpm deps:check`, which fails when server code imports a package declared only in devDependencies. That mistake resolves in every development checkout and is absent exactly once, on the deployed server, where it surfaces as a bare `Cannot find package`.

## 1.0.0-beta.13

### Patch Changes

- 66dba5d: Pass the complete client plugin composition to `defineAppRuntime()`.

  The runtime now resolves plugin route component overrides from the same `AppClientPlugins` object as every other plugin contribution, while application route overrides remain a separate declaration.

  The Client Application now validates the auth provider and guest login route required by authenticated routes internally, keeping those details out of application composition roots.

## 1.0.0-beta.12

### Minor Changes

- 6f9b399: Rewrite the template's agent and human documentation around building an application rather than developing a plugin. `README.md` now describes the project structure, how to run it, and what each of its own pnpm scripts does; `AGENTS.md` describes how to build a feature — pages, shadcn/ui components, endpoints, database access, migrations, and translations — and routes to a new `skills/nocobase-app-development/` skill whose references carry the detail. The nested `client/AGENTS.md` and `server/AGENTS.md` are rewritten to match: the server guide previously told agents to put new domain APIs in a plugin package, the opposite of what an application scaffold should say, and the client guide was largely about a `client-old/` directory that no longer exists.

  The page-to-sidebar path is now written down. Declaring a route makes the URL work but leaves the page out of navigation, which needs a Refine resource registered in `client/service-provider.ts`; the documentation previously described only the route half, so a page added by following it would have been unreachable from the sidebar. The guidance also now separates the directories business code belongs in from the framework scaffolding the template replaces on upgrade, and asks that both be updated together when an application changes that structure.

  The authorization Skill moves from `@nocobase/authorization` to `@nocobase/app-plugin-authorization` and is renamed `nocobase-app-plugin-authorization`. Skills synchronize from registered plugins, so one published by a library could never reach an application; its example also imported `@nocobase/authorization/database`, which an application does not depend on, and now imports the types the plugin re-exports.

  The guidance now points at the plugins an application already has. A prompt asking for approvals, notifications, or per-user record access was answerable only by building those from scratch, because nothing told an agent that `app-plugin-workflow`, `app-plugin-notification`, and `app-plugin-authorization` are installed and publish their own Skills — `.agents/skills/` was described only as generated output not to edit. Server route guidance also covered `can()` but not `authorize()`, so an ownership rule like "a salesperson sees only their own customers" had no documented path other than filtering rows in memory after fetching them, and scheduled work had no guidance at all.

  Application-owned migrations now reach the build. `database/migrations` and `database/seeds` exist in the template, and `tsconfig.server.json` compiles `database/**/*.ts`, so a migration an application writes is typechecked and emitted to `dist/database/` — which `scripts/build-server-dist-package.mjs` already expected to find. `pnpm migrate` applied such a migration before this change, but `pnpm build` silently dropped it. The unreferenced `tsconfig.migrations.base.json` is removed.

  `app-template-hub` receives the same framework-level change, since it is the same application scaffold with a different product identity: the rewritten documentation and the `nocobase-app-development` Skill, `CLAUDE.md`, and the migration build fix, which it had the identical version of. The repository `AGENTS.md` now records that framework changes to one template belong in the other by default, with the parts that stay template-specific.

## 1.0.0-beta.11

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

## 0.1.0-beta.10

### Minor Changes

- ac3f033: Replace aggregated application configuration objects and config factories with typed module-owned configuration definitions. Applications now compose defaults, file providers, environment layers, validation, explicit reloads, and subscriptions through `AppConfig`, while providers read their configuration through `app.config.get(definition)`.
- ac3f033: Export every server plugin from its package's `./server` entry point, and update application composition, plugin discovery, and generated plugins to use the unified entry point.

### Patch Changes

- 78cf0a2: Add machine-readable plugin lifecycle results and a read-only plugin registration inspector for Agent workflows.
- 78cf0a2: Complete the four-Route full-stack example and add a stable Agent-facing Client inspection protocol.
- 78cf0a2: Add a complete App-facing Plugin Skill example with a reusable Notice component, an authenticated Server API, target-App integration tests, and capability-aware Skill scaffolding. Clarify System Info ownership, authorization, and behavioral verification guidance.
- 78cf0a2: Keep synchronized `.agents` content out of generated application source control while preserving local Plugin Skill synchronization and inspection.
- 1b5f10f: Accept `--template hub` in `create-app`, and scaffold a hub as a hub rather than as an app.

  A hub has no database, so the app flow was wrong for it in every step that touches one: it would have asked which dialect to use, added a driver dependency the hub never loads, and written a `config.yml` the hub never reads. A template now declares what it is through `nocobase.templateKind`, and `create-app` reads that to decide which flow applies — falling back to the package name so a local path to a checkout predating the field still works. The kind is settled after the template is downloaded, because a package specifier or a local path does not reveal it any earlier.

  A generated hub gets the scaffolding `nb3 hub create` already produced: `.env` derived from the template's `.env.example` with `APP_NAME` set to the project name, `.nb3/hub.json` so the `nb3 hub` commands can find it, `app-dist/` for the apps it serves, the runtime directories it writes into, and the matching `.gitignore` entries. `--db-dialect` is reported as ignored rather than silently dropped when it is passed alongside a hub template.

- 78cf0a2: Generate runtime-aware TypeScript, ESLint, Node engine, and development dependency configuration for Client-only, Server-only, and full-stack plugins, including stable package-scoped Queue Job identities.

  Keep plugins aligned with the Agent development contract by giving Queue, System Information, and Workflow Routes path-scoped authentication, documenting the Queue API path and Database declaration source accurately, and storing example tests under each plugin's root test directory.

- fb1a752: Unify Client and Server application composition around the explicit `serviceProviders` contribution and rename Client React tree contributions to `reactProviders`.

  Replace Client bootstrap modules with application-owned ServiceProvider lifecycle hooks, make the default Client start through `ClientApplication` and render through the Browser host, and update built-in plugins and runtime inspection to the new static contribution protocol.

- 78cf0a2: Add declaration-level Server plugin inspection with real Route contribution order, and make the Routes example own a path-scoped authentication boundary.
- fb1a752: Transport public Client configuration through a versioned, safely escaped JSON data block in SPA HTML and read it automatically during Client runtime resolution.

  Apply the same HTML transformation to production static responses and development Vite proxy responses, and document the public `config.yml` Client section in the default template.

## Unreleased

### Patch Changes

- Show Client and Server locale declarations in application inspection without executing locale loaders.
- Make locale-only Client inspection skip unrelated Route and Provider factories.
- Include explicit Client Route and Settings order in inspection snapshots.

- Simplify Client startup into Runtime definition, application creation, and rendering stages by using the shared `@nocobase/app-client/runtime` API.

## 0.1.0-beta.9

### Minor Changes

- 7cdffbd: Add explicit `server/plugin.ts` definitions for Providers, API routes, root routes, database sources, and queue jobs. Register routes in a dedicated Application phase after Provider boot, add reusable HTTP and runtime composition helpers to their owning packages, and remove the default template's duplicate runtime layer and legacy plugin discovery contract.

### Patch Changes

- 7cdffbd: Add reusable application-scope cancellation and disposer lifecycle primitives, and use them for the default template standalone scope.
- 7cdffbd: Add reusable application-scope path, environment, and routing resolvers, while keeping default-template configuration mappings application-owned.
- 7cdffbd: Move public base-path mounting and mounted origin proxy adapters into `@nocobase/app-server-kit` so standalone applications can reuse the host-neutral runtime boundary.
- ce4eab8: Add a focused ServiceProvider plugin example with a tokenized heartbeat
  service, lifecycle management, and an HTTP status route. Pass the Application
  directly to providers and standardize service access through `app.container`.
- 7cdffbd: Replace separate API and root route arrays with one ordered `routes` contribution array. Route factories now receive the Application, create and return their own Hono router, and are mounted automatically at `/api` or the application root according to their definition.

  Standardize plugin server modules around `providers/index.ts` and `routes/index.ts` collection entries, `services/` domain implementations, and a stable `tokens.ts` public contract.

  Generated plugins now declare conventional database and queue contribution directories by default. Missing optional directories are ignored until executable migrations, seeds, or jobs are added.

  Generated plugins now include an App-facing starter Agent Skill under the package's `skills/` directory. Plugin registration and skill synchronization copy these package-owned Skills into registered applications' `.agents/skills/` directories.

  Unify Client page contributions behind one `routes` loader. Plugins now use `defineAppRoutes()` and `defineSettingsRoutes()` to add child Routes to the application's two built-in Client Routes, mirroring how Server plugins use `defineRootRoutes()` and `defineApiRoutes()` with the built-in Hono routers.

- 7cdffbd: Add reusable Node HTTP, WebSocket, and standalone server definition adapters with graceful shutdown handling, Vite overrides, mounted application lifecycle ownership, standard listen configuration, and startup cleanup. Reduce the default template standalone entry to binding its root directory, Runtime Definition, and shared server factory. Derive the application package name from its root package metadata and keep standard standalone routing defaults in the Node runtime instead of repeating them in each Runtime Definition.
- 12dfb68: Add the template-based `@nocobase/create-plugin` scaffold with complete client and server examples, including shadcn configuration for plugin-owned runtime UI and an application-owned Registry component recipe with build, materialize, and publishing metadata. Reuse the `nb3 app plugin` commands from the monorepo root, and register exported server plugin definitions in the application's explicit `server/plugins.ts` composition root.
- 8438765: Add Resend, Feishu, and DingTalk notification Providers; allow Feishu and DingTalk to be enabled together with logical IM targets and channel-scoped `single` or `all` Provider routing; add provider-aware recipient resolution and structured delivery errors; add an access-controlled Notification logs page to Hub settings; and document secure template configuration and authenticated Provider verification.
- 7cdffbd: Move server plugin manifest resolution, Provider loading, and database or queue contribution discovery into the public `@nocobase/app-server-kit/plugins` entry. The default application template now consumes the shared implementation.
- 7cdffbd: Add declarative application Runtime Definitions, shared application Scope, path, and disposal contracts, reusable Node standalone Scope and environment loading utilities, and focused Runtime Config section resolution. Resolve plugins before config factories and pass the complete resolved Runtime into application assembly, making Runtime plugins the single source for both configuration contributions and provider or route registration. Use the shared Runtime assembly across app-host and the default application template so embedded and standalone modes no longer maintain separate structural copies. Remove the template-local Scope and config-loading infrastructure, require standalone entrypoints to pass their resolved application root explicitly, and remove the legacy `/v2/api` proxy contract in favor of each application's local `/api` router.

## 0.1.0-beta.8

### Patch Changes

- a0cc151: Fix plugin utility classes missing from the stylesheet, which left plugin pages unstyled in a generated application: spacing collapsed, buttons stretched full width, and badge colours disappeared.

  The `@source "../node_modules/@nocobase/app-plugin-*/client"` globs never matched anything. pnpm links every dependency as a symlink into its store, and Tailwind's scanner does not expand a wildcard through one, so no plugin file was ever scanned — in this repository or in a generated application. It only looked correct here because workspace plugins resolve to TypeScript sources that Vite compiles, and the Tailwind Vite plugin scans what Vite transforms. An installed plugin resolves to prebuilt `dist/client` output, which Vite does not transform, so neither mechanism saw it.

  A `tailwind.config.mjs` now resolves each plugin's client directory to its real path before scanning, which gets past the symlink, and covers both `client` and `dist/client` so a workspace plugin and an installed one are scanned the same way. `@nocobase/app-client` is scanned through the same mechanism, replacing a `@source` that pointed outside a generated application's directory and resolved to nothing there.

## 0.1.0-beta.7

### Minor Changes

- 062f5b1: Add `settings` to `defineClientPlugin`, a fourth contribution type alongside `bootstrap`, `routes`, and `providers`. A plugin points it at a module that default-exports an array of setting definitions, or a function of the plugin options returning one, and each entry becomes a page in the application's settings centre.

  An entry is either a page — `id`, `title`, an optional `icon` and `access` rule, and a `pageLoader` — or a group that carries an icon and title once for a set of pages. Ids are single URL segments and nesting comes from the tree, so a page under a group is served at `/settings/<group>/<page>`, and a plugin contributing one page declares it without a group and gets `/settings/<id>`. Groups nest one level. Settings and routes share one path space, so a route and a page that would mount at the same address fail resolution with both identities named.

  The default template renders the settings centre, reusing the application shell's chrome — brand, sidebar collapse, theme, and user menu — with `Back to app` where the workspace label sits and no gear pointing at itself. The left rail collapses by group the way the product sidebar does. A page whose `access` rule is denied is left out of the navigation and cannot be reached by its URL either, and a group whose pages are all denied disappears with them. A setting whose `access` rule is denied is left out of the navigation and cannot be reached by its URL either. Authorization's four administration pages now arrive this way, at the URLs they already had, and no longer appear in the product sidebar.

  `client:inspect` gains `--type settings`, and `pnpm plugin:create` scaffolds a `client/settings.ts` entry.

- c8f38c8: Register client plugins explicitly in the application's `client/plugins.ts` instead of discovering them from `nocobase.plugins` through a Vite virtual module.

  Each plugin now ships a `client/plugin.ts` descriptor, exported as `./client/plugin`, that declares its bootstrap, routes, providers, and route component overrides. An application composes them with `defineClientPlugins([...])`, where array order is bootstrap order and a plugin is enabled by being present. The entry is real, type-checked application source: it can be read, diffed, and edited, and Vite reloads it like any other module.

  Plugins can also accept options. `defineClientPlugin` takes an options type that reaches the bootstrap context, the routes and providers factories, and the route component overrides, so an application can pass a custom login page or a notification label at registration.

  `@nocobase/app-plugin-registry-example` only drops its now-unread `nocobase.plugin.client` manifest field; it contributes no client extensions.

### Patch Changes

- f09425b: Add the File plugin with a minimal route-and-store server API, system-administrator Demo management, default-disk fixture initialization, safe Unicode filenames, bounded multipart uploads, hardened content delivery, same-origin requests, observable setup, and independently installable Registry UI.
- 39bd8ec: Fix `pnpm app:dev` hanging at `Starting app dev server...` when a stale process from another project still listens on the Vite port. Port selection bound the wildcard address `0.0.0.0`, which succeeds even when another process holds `127.0.0.1` on the same port, while the readiness probe requested that loopback address and reached the other process instead. The dev server therefore polled a foreign server for two minutes and failed with a misleading `HTTP 404`.

  Port selection now also probes the loopback addresses behind a wildcard host, so it picks a port that the readiness probe can actually reach. Only a genuine `EADDRINUSE` rules a port out, which keeps hosts without an IPv6 stack from discarding usable ports.

- 1a9732a: Re-export the client registration factory as the default from `client/index.ts`, so an application registers a plugin by importing `<package>/client` instead of `<package>/client/plugin`. `client/plugin.ts` still defines the factory and its `./client/plugin` subpath still resolves; the barrel simply re-exports it.

  Every plugin now declares `sideEffects: false`. An application imports the barrel, which also carries types, helpers, and components, and without that declaration a bundler must assume each of those matters and keeps them in the application entry chunk. With it, importing `<package>/client` costs exactly what importing `<package>/client/plugin` cost: the entry chunk is byte-identical for all eight plugins, where before it grew by 696 bytes for authentication and 88 for file.

  The declaration was checked rather than assumed: every client module's top-level statements are pure declarations, with no global assignment and no bare `import './x.css'`. The CSS imports under `app-plugin-workflow/registry` are copied as source by `registry materialize` and never bundled through `exports`. A plugin that later introduces a module-level side effect must drop the declaration.

  `@nocobase/app-plugin-workflow` additionally points `./client` at `./client/index.ts` rather than `./dist/client/index.js`, matching every other plugin. Consuming the built output made the barrel resolve to a stale artifact, which failed the build outright.

- c8f38c8: Add `nb3 app plugin register` and `nb3 app plugin unregister`, so an application generated from the template can install, wire, and remove a plugin. Both are available as `pnpm plugin:register` and `pnpm plugin:unregister`.

  Registering installs the package, records the dependency and the `nocobase.plugins` entry, imports the plugin in `client/plugins.ts`, and copies the skills it ships into `.agents/skills`. Unregistering reverses all four. The editing logic is shared with this repository's own `plugin:register` scripts; only the plugin lookup and the recorded dependency range differ.

  Only a plugin that ships a `./client/plugin` export is written into `client/plugins.ts`. A server-only plugin is registered without it, because importing an export it does not have leaves the application unable to build.

  An application without TypeScript still gets the install, the manifest entry, and the skills; only the `client/plugins.ts` edit is skipped, and the exact lines to add are printed so they can be applied by hand or by an agent.

- a38f531: Restore the `plugin:register`, `plugin:unregister`, `plugin:update`, `plugin:skills:sync`, and `client:inspect` scripts, along with the `@nocobase/nb3-cli` dependency they invoke. A merge resolution dropped them, which left the workflow documented in `docs/cli/README.md` unrunnable: the scripts these docs tell users to run did not exist in the template.

  Nothing at runtime reads these scripts, so their absence broke no build and failed no test. A new test asserts the documented command surface, so the next time one goes missing it fails loudly instead of silently.

## 0.0.1-beta.6

### Patch Changes

- eb195d0: Roll production log files daily and retain up to seven files by default.

## 0.0.1-beta.5

### Patch Changes

- 8fb9319: Declare the pnpm version this package is developed with, so working on it uses the same pnpm as the rest of the monorepo.

## 0.0.1-beta.4

### Patch Changes

- 0465323: Introduce the plugin-based authorization core and permission management UI. Replace the previous authorization API with composable core, database, permission-set, default-access, sharing-rule, restriction-rule, and page plugins; add route access metadata to the application client; publish and enable the authorization app plugin in the default template; and correct the Hub documentation to use the v3 Portal SDK package name.

## 0.0.1-beta.3

### Patch Changes

- 31245b6: Align `nocobase.defaultTemplateVersion` with the package version. Releases now synchronize the two, so an application generated from the template no longer inherits a stale template version.

## 0.0.1-beta.2

### Patch Changes

- 89fc34a: Upgrade Agent Annotations to version 0.1.5 and prevent its runtime files from triggering repeated Vite page reloads.

## 0.0.1-beta.1

### Patch Changes

- 509d812: Localize the shadcn UI components used by applications, plugins, and registries so they can customize their presentation independently. Remove the `@nocobase/app-client/ui` entry point and migrate its consumers to package-local components.

## 0.0.1-beta.0

### Patch Changes

- da1b1b0: 首次发布。
