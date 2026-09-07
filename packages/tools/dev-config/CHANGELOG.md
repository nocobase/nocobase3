# @nocobase/dev-config

## 0.1.0-beta.4

### Patch Changes

- 813da59: Require eslint-plugin-react-refresh 0.5.6, which restores the member-expression check that 0.5.5 dropped. Under 0.5.5 an aliased component export such as `const Select = SelectPrimitive.Root` was reported as a non-component export, so a freshly generated application failed `pnpm lint` on an untouched shadcn/ui file.

## 0.1.0-beta.3

### Minor Changes

- 174eab5: Consolidate the browser packages into `@nocobase/app-client`.

  `@nocobase/app-sdk` is gone; its API client now lives in `@nocobase/app-client` and is imported from there. `@nocobase/app-portal-sdk` is deprecated and keeps only what still has consumers: `NocoBaseClient` and the runtime configuration it reads, which exist to reach a v2 NocoBase server, and the route surface containers under `/routing`. Its ACL, auth, data, extension, i18n, and system-settings modules are removed, as is the route tree that `/routing` used to export alongside the surfaces.

  `@nocobase/app-client` gains `resolveAppBase()`, which reports the path the application is mounted at.

  Four plugins built their API client at import time instead of resolving it from the application's service container, so they could not see `api.baseURL` from the application configuration. They now resolve it, which means an application that configures a base URL gets one client rather than two that disagree.

  The injected browser global `NOCOBASE_PORTAL_BASE` is renamed to `APP_BASE_PATH`. Its value has always been the `APP_BASE_PATH` environment variable, and the old name grouped it with the settings that address a v2 NocoBase server. Those keep their names. A client and the server that serves it must be upgraded together.

  `@nocobase/app-plugin-data-provider` is removed. It forwarded the Portal data provider, and applications built on the current client runtime do not use it.

  The Hub template is rebuilt from the default template and now runs the same client and server stack as every other v3 application. Its `/api/apps` endpoint and its v2 API proxy are gone, so a hub's `.env` no longer configures them.

  The Portal SDK's template compatibility check is removed with the rest: it had been disabled behind a constant, and its install script cost every generated project a `pnpm-workspace.yaml` `allowBuilds` entry it did not need. `createPortalViteConfig` no longer takes the plugin that injected it.

### Patch Changes

- 174eab5: Keep `dist` readable while it rebuilds. The build deleted the directory before compiling, so a package linting in parallel could fail to resolve `@nocobase/dev-config/eslint` during that window. The output is now staged and swapped in once compilation succeeds, which also leaves the last good build in place when compilation fails.
- 02876d6: Raise the shared Vitest `testTimeout` and `hookTimeout` to 30 seconds. Vitest's 5-second default is a local-machine number: CI runs every package's suite in parallel on one shared runner, so work that finishes in under a second on a developer's machine can take several seconds there. A test that grows legitimately then fails as a timeout on CI long before it is slow enough to notice locally. A package that needs a different value still sets its own, which continues to take precedence over the shared one.

## 0.0.1-beta.2

### Patch Changes

- fb1a752: Make the shared service-provider runtime environment-neutral and add a matching universal ESLint configuration for libraries that do not depend on Node, browser, or React globals.

## 0.0.1-beta.1

### Patch Changes

- b049266: Add language switching on top of `@nocobase/app-i18n`. Applications and plugins declare their locales the same way on both sides, the browser loads only the language it is showing, and the chosen one is kept in storage and mirrored to the server session.

## 0.0.1-beta.0

### Patch Changes

- da1b1b0: 首次发布。
