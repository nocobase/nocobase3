# @nocobase/app-host

## 0.1.0-beta.7

### Patch Changes

- d927494: Fix development startup of generated Hub applications by selecting the App Host launcher from the loaded package format, preserving source development in the workspace and using compiled JavaScript in installed packages. Keep the optional application configuration commented out so an empty YAML section cannot override application identity defaults during production startup. Correct the AI Employee plugin Skill namespace so generated applications can synchronize their registered plugins' Skills.

## 0.1.0-beta.6

### Patch Changes

- 1decf5f: Report which deployment phase failed, and why, instead of a bare summary

  A failed deployment told an operator what went wrong without saying where. Reporting went through `rootErrorMessage`, which walks an error's `cause` chain to the innermost failure and discards every wrapper along the way, so `Cannot find package 'hono'` was the whole of it — with nothing to say whether the package was missing while the artifact was being installed or when the application started, which are different faults with different fixes.

  Artifact installation now records each phase as it completes, and a failure reports the phase it died in together with the phases that had already succeeded: `Deployment failed during discovery after artifact download 1.2s, extract 3.4s: ...`. `AppCreateFailedError` and `AppReloadFailedError` fold their cause into their own message, so the reason survives the Host IPC boundary, which serialises an error to its message alone. An `AggregateError` is unfolded rather than summarised, so a failed replacement reports both the activation failure and the failed restore.

  Deployment status reporting uses those messages instead of digging out the innermost cause. `rootErrorMessage` remains for matching an underlying failure, alongside a new `fullErrorMessage` for anything an operator reads.

  Only phase names, durations, and error messages are included. Subprocess output is deliberately left out, because a dependency install prints registry URLs and authentication traces, and this string is stored and shown wherever a deployment is.

## 0.1.0-beta.5

### Patch Changes

- e11b855: Fail with a clear error when managed app-host port discovery reaches the TCP port limit.
- e11b855: Republish managed application configuration before activating a stopped deployment.
- e11b855: Read the application manifest from `dist/package.json` when loading `pnpm build --tar` artifacts.
- Updated dependencies [f17f3a6]
- Updated dependencies [ceb356b]
  - @nocobase/config@0.1.0-beta.1
  - @nocobase/logging@0.1.0-beta.4

## 0.1.0-beta.4

### Minor Changes

- a864497: Add standalone and Hub-managed host modes, startup-only YAML or JSON host configuration, FS and S3 release deployment through NocoBase Drive, strict desired deployment reconciliation, file configuration path selection, host-owned structured logging, shared ws-backed App WebSocket handling, private authenticated child-process management over Node IPC, and bounded managed-host crash recovery. Managed deployments use checksum-addressed immutable revision directories, stop-first Runtime replacement with bounded graceful request draining, and a three-revision local cache for fast rollback. Rename the Host's in-process runtime implementation to `InProcessAppHandle`.

### Patch Changes

- a864497: Wait for prior revision cache cleanup before resolving or restoring the next deployment. Reject configuration publishing when the application is not registered or has no runtime configuration file instead of reporting success.
- a864497: Register the Application Hub in the Hub template and provide an application control plane. Release artifacts supply their version and an optional `config.example.yml` or `config.example.yaml` template, while applications choose Config file or External configuration and reserve Hub-managed configuration for a future database-backed implementation. Hub actions reconcile only the selected application, reuse an already installed matching artifact, report deployment phase timings, and support removing an application and its persisted resources. Separate Hub desired configuration files from Host-owned runtime configuration, rebuild recovery targets when Host becomes ready, and split the management page into business modules.

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
