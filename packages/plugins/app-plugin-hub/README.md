# @nocobase/app-plugin-hub

The first-party control plane for applications run by a managed NocoBase App Host.

The initial implementation supports a single Hub-spawned Host and in-process Apps. Its application catalog supports card and list views; each App opens into an operational detail workspace with runtime and deployment facts in the header plus Releases, Resources, post-deployment Configuration, and Settings tabs. Resources uses vertical navigation for Databases, Drives, Caching, and LLM services; safe summaries for the first three are discovered by configuration key, while LLM services remain reserved for a management API. Apps without a Release show Development first with the `create-app` bootstrap command. Release upload and deployment are separate actions; deployment uses a three-step Release, Configuration, and Review flow. Settings choose whether the App activates with Hub (`eager`, the default) or registers for activation on its first visit (`lazy`); deployments do not change this policy. The workspace also provides live Host status refresh, App access, start, stop, removal, and desired-state recovery after Hub startup. Interactive deployment and runtime operations reconcile only the selected App; complete deployment sets are reserved for Host startup recovery. Stop preserves the installed definition so Start can reactivate it, while Remove permanently deletes the App record, Releases, deployment files, configuration, and App volume.

Artifacts are stored through `@nocobase/drive`. Hub reads the Release version from `package.json`; uploaders do not provide it separately. A Release may include a root `config.yml`; Hub uses it automatically as the initial editable Config file template without replacing an App's saved configuration. Each deployment chooses Config file or External configuration, while the Configuration tab exposes the latest deployed choice without allowing it to be switched in place. The UI reserves Hub managed configuration for a future database-backed implementation. Config files live at `storage/app-volumes/<appId>/config.yml`; expanded Releases are installed by the Host under `storage/app-deployments`.

Reconciliation reuses an already installed directory when the Release identity and checksum match, and the Host logs artifact and runtime activation phase durations. A failed deployment returns an error response while retaining the previous desired and observed deployment state.

The management API is restricted to system administrators. The browser page is available at `/hub`.
The Hub template redirects its root route to `/hub` and uses Applications as its primary navigation entry.

This version does not provide remote Hosts, multiple Hosts or environments, configuration publications, external provider integration, or database migration rollback. Database migration and seed behavior remains part of App startup.

Set `HUB_HOST_ENABLED=false` only for processes that need Hub metadata without starting its local managed Host, such as composition-only tests.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-hub lint
pnpm --filter @nocobase/app-plugin-hub typecheck
pnpm --filter @nocobase/app-plugin-hub test
pnpm --filter @nocobase/app-plugin-hub build
```
