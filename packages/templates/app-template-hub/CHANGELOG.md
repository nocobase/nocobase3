# @nocobase/app-template-hub

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
