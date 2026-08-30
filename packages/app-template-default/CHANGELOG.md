# @nocobase/app-template-default

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
