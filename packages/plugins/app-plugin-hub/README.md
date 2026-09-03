# @nocobase/app-plugin-hub

The first-party control plane for applications run by a managed NocoBase App Host.

The initial implementation supports a single Hub-spawned Host and in-process Apps. Its application catalog supports card and list views; each App opens into an operational detail workspace with runtime and deployment facts in the header plus Releases, Resources, post-deployment Configuration, and Settings tabs. Resources uses vertical navigation for Databases, Drives, Caching, and LLM services; safe summaries for the first three are discovered by configuration key, while LLM services remain reserved for a management API. Apps without a Release show Development first with the `create-app` bootstrap command. Release upload and deployment are separate actions; deployment uses a three-step Release, Configuration, and Review flow. Settings choose whether the App activates with Hub (`eager`, the default) or registers for activation on its first visit (`lazy`); deployments do not change this policy. The workspace also provides live Host status refresh, App access, start, stop, and removal. Runtime state always comes from App Host and is reported as unknown when Host is unavailable. Interactive operations reconcile only the selected App; complete deployment sets are reserved for Host startup recovery. Stop sets the persisted `enabled` policy to false while preserving the current deployment so Start can reactivate it. Remove permanently deletes the App record, Releases, deployment history, configuration, and App volume.

Artifacts are stored through `@nocobase/drive`. Hub reads the Release version from `package.json`; uploaders do not provide it separately. Version is a display label, so multiple builds may share a version and remain distinct by Release ID and checksum. A Release may include a root `config.yml`; Hub uses it automatically as the initial Config file template. Each deployment chooses Config file or External configuration, while the Configuration tab exposes the latest deployed choice without allowing it to be switched in place. The UI reserves Hub managed configuration for a future database-backed implementation. Config snapshots live at `storage/app-volumes/<appId>/configs/<deploymentId>.yml`; expanded Releases are installed by the Host under `storage/app-deployments`.

Deploy and rollback requests persist a queued operation and return HTTP 202. The in-process runner serializes operations for one App while allowing different Apps to deploy concurrently. The page polls active operations and exposes deployment history with rollback actions. Rollback creates a new record from a previously successful deployment. The current deployment pointer changes only after Host reports success, so a failure leaves the active deployment untouched. Reconciliation reuses an already installed directory when the Release identity and checksum match, and the Host logs artifact and runtime activation phase durations.

During Hub startup, only managed Host availability is awaited. Restoring the complete deployment set runs in the background, so eager App activation does not delay Hub readiness. App Host currently reconciles that startup set through its existing serial operation queue; this bounds startup load and preserves deployment revision ordering.

The management API is restricted to system administrators. The browser page is available at `/hub`.
The Hub template redirects its root route to `/hub` and uses Applications as its primary navigation entry.

This version uses an in-process deployment runner rather than a separate durable queue worker. If Hub restarts during an operation, the persisted queued/deploying record is marked failed and can be retried manually. It does not yet provide retained expanded revision caches, remote Hosts, multiple Hosts or environments, configuration publications, external provider integration, or database migration rollback. Database migration and seed behavior remains part of App startup.

Set `HUB_HOST_ENABLED=false` only for processes that need Hub metadata without starting its local managed Host, such as composition-only tests.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-hub lint
pnpm --filter @nocobase/app-plugin-hub typecheck
pnpm --filter @nocobase/app-plugin-hub test
pnpm --filter @nocobase/app-plugin-hub build
```
