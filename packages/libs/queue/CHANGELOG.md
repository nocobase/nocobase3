# @nocobase/queue

## 0.1.0-beta.6

### Minor Changes

- e0c4b3d: Add a transaction-safe physical row upsert API and use it through a unified Queue adapter accepting DatabaseConnection, with the upstream Knex client bridge kept private. Fix scheduler startup across database dialects while preserving schedule execution history.

  Preserve the outer Oracle transaction when a nested savepoint completes, allowing inserted rows to roll back with their owning transaction.

  Retry deadlocks with bounded backoff when a physical row upsert owns its transaction; preserve caller-owned transaction boundaries and propagate failures requiring the caller to retry.

  Recognize Dameng unique-key conflicts during concurrent upserts and preserve the outer transaction when knex-dm finishes a nested savepoint.

  Declare Knex as a Dameng runtime dependency so nested transaction support also works in registry installations.

### Patch Changes

- Updated dependencies [e0c4b3d]
- Updated dependencies [e13ed84]
- Updated dependencies [e13ed84]
- Updated dependencies [00362cf]
- Updated dependencies [e13ed84]
  - @nocobase/db@1.0.0-beta.10
  - @nocobase/logging@0.1.0-beta.5

## 0.1.0-beta.5

### Minor Changes

- 26ac480: Add code-defined Cron scheduling with timezone support, transactional synchronization, and stable schedule identities. Applications and plugins register schedules with `SchedulerService.defineSchedule(definition)` and execution targets with `registerTarget()` during provider registration or boot.

  Route scheduled jobs and workers through the application's configured logical queue, with an adapter-neutral schedule store. Keep the upstream queue dependency unmodified and store queue and scheduler timestamps compatibly with their adapters while preserving absolute instants.

  Move queue storage migrations from Scheduler into the queue library, which resolves configured database connections and physical tables. Assemble these sources centrally in app-server for startup and CLI commands, rejecting overlapping active queue tables before execution. Support immutable target parameters, shared migration history and locks, upstream-compatible physical schemas, and read-only execution conditions that leave skipped migrations unapplied.

  Track idempotent occurrences through the target's final outcome, including asynchronous Workflow completion and recovery with stable run references. Target registration returns a completion-reporting handle scoped to that target; long-running executions can report completion without a fixed scheduler observation timeout.

  Provide an authorized, read-only schedule management page and API with paginated schedules, trigger counts, execution history, and separate schedule and execution statuses. Register `pnpm nocobase schedule sync` as a global CLI command and integrate it into all application templates.

  Include application examples for custom task targets and scheduled Workflows, and agent guidance for schedule definition, target selection, asynchronous execution, diagnostics, and recovery.

  Keep the database manifest CLI entry available before compilation so fresh workspace installs link the command required by package builds.

  Declare the OpenTelemetry dependencies referenced by the upstream queue declarations so consumers can typecheck published Server APIs without enabling tracing or skipping library checks.

### Patch Changes

- Updated dependencies [24e771f]
- Updated dependencies [26ac480]
  - @nocobase/db@1.0.0-beta.9

## 0.1.0-beta.4

### Patch Changes

- 028dd7c: Use host-provided peers for shared database types, authorization errors, service tokens, cache registries, and repository filter metadata. Declare their production providers in all application templates so deployments with automatic peer installation disabled retain the required runtime packages. Document the provider contract for generated plugins.

  Existing applications upgrading these packages must add compatible versions of their required shared peers to production dependencies: @nocobase/db, @nocobase/service-provider, @nocobase/repository-input, @nocobase/authorization, @nocobase/caching, @nocobase/i18n, and @nocobase/queue for the standard server stack, plus @nocobase/ai-employee when using its plugin. Update the lockfile and verify the production install; peer declarations do not remove incompatible historical versions automatically.

- Updated dependencies [028dd7c]
  - @nocobase/db@1.0.0-beta.8

## 0.1.0-beta.3

### Patch Changes

- Updated dependencies [174eab5]
  - @nocobase/db@1.0.0-beta.2

## 0.1.0-beta.2

### Minor Changes

- ac3f033: Replace aggregated application configuration objects and config factories with typed module-owned configuration definitions. Applications now compose defaults, file providers, environment layers, validation, explicit reloads, and subscriptions through `AppConfig`, while providers read their configuration through `app.config.get(definition)`.

### Patch Changes

- Updated dependencies [948304d]
- Updated dependencies [ac3f033]
  - @nocobase/logging@0.1.0-beta.3

## 0.1.0-beta.1

### Minor Changes

- 7cdffbd: Add explicit `server/plugin.ts` definitions for Providers, API routes, root routes, database sources, and queue jobs. Register routes in a dedicated Application phase after Provider boot, add reusable HTTP and runtime composition helpers to their owning packages, and remove the default template's duplicate runtime layer and legacy plugin discovery contract.

### Patch Changes

- ce4eab8: Add a focused ServiceProvider plugin example with a tokenized heartbeat
  service, lifecycle management, and an HTTP status route. Pass the Application
  directly to providers and standardize service access through `app.container`.
- Updated dependencies [ce4eab8]
- Updated dependencies [7cdffbd]
  - @nocobase/logging@0.1.0-beta.2
  - @nocobase/service-provider@0.0.2-beta.0
  - @nocobase/app-database@0.0.1-beta.1

## 0.0.1-beta.0

### Patch Changes

- da1b1b0: 首次发布。
- Updated dependencies [da1b1b0]
  - @nocobase/app-database@0.0.1-beta.0
