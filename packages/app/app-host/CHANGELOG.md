# @nocobase/app-host

## 0.0.1-beta.3

### Patch Changes

- Updated dependencies [174eab5]
- Updated dependencies [174eab5]
  - @nocobase/app-server@1.0.0-beta.4

## 0.0.1-beta.2

### Patch Changes

- 7cdffbd: Add a runnable Koa fixture that adapts Koa's Node HTTP handler to the embedded app Fetch contract, and load workspace TypeScript exports correctly from the app-host development scripts.
- 7cdffbd: Add declarative application Runtime Definitions, shared application Scope, path, and disposal contracts, reusable Node standalone Scope and environment loading utilities, and focused Runtime Config section resolution. Resolve plugins before config factories and pass the complete resolved Runtime into application assembly, making Runtime plugins the single source for both configuration contributions and provider or route registration. Use the shared Runtime assembly across app-host and the default application template so embedded and standalone modes no longer maintain separate structural copies. Remove the template-local Scope and config-loading infrastructure, require standalone entrypoints to pass their resolved application root explicitly, and remove the legacy `/v2/api` proxy contract in favor of each application's local `/api` router.
- Updated dependencies [b049266]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [ce4eab8]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
- Updated dependencies [7cdffbd]
  - @nocobase/app-server-kit@0.1.0-beta.2

## 0.0.1-beta.1

### Patch Changes

- 0465323: Expose application configuration paths to server plugins and add helpers for mounting redirect responses below an application's base path. Application hosts now rewrite root-relative redirects returned by embedded applications so installation and other redirects remain inside the mounted application.
- Updated dependencies [0465323]
  - @nocobase/app-server-kit@0.0.1-beta.1

## 0.0.1-beta.0

### Patch Changes

- da1b1b0: 首次发布。
- Updated dependencies [da1b1b0]
  - @nocobase/app-server-kit@0.0.1-beta.0
