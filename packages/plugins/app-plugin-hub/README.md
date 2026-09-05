# @nocobase/app-plugin-hub

The first-party control plane for applications run by a managed NocoBase App Host.

The initial implementation supports a single Hub-spawned Host and in-process Apps. Its application catalog supports card and list views; each App opens into an operational detail workspace with runtime and deployment facts in the header plus Releases, Resources, post-deployment Configuration, and Settings tabs. Resources uses vertical navigation for Databases, Drives, Caching, and LLM services; safe summaries for the first three are discovered by configuration key, while LLM services remain reserved for a management API. Apps without a Release show Development first with the `create-app` bootstrap command. Release upload and deployment are separate actions; deployment uses a three-step Release, Configuration, and Review flow. Settings choose whether the App activates with Hub (`eager`, the default) or registers for activation on its first visit (`lazy`); deployments do not change this policy. The workspace also provides live Host status refresh, App access, start, stop, and removal. Runtime state always comes from App Host and is reported as unknown when Host is unavailable. Interactive operations reconcile only the selected App; complete deployment sets are reserved for Host startup recovery. Stop sets the persisted `enabled` policy to false while preserving the current deployment so Start can reactivate it. Remove permanently deletes the App record, Releases, deployment history, configuration, and App volume.

Releases accept a root `config.example.yml` or `config.example.yaml` as an editable template. Real `config.yml` files are not imported. File-mode deployments write private, atomic configuration files to `storage/app-volumes/<appId>/configs/config.<deploymentId>.yml`. Each new deployment or rollback gets a distinct file; rollback preserves the target mode, not its old path. The current deployment's path survives Host restarts. Save and publish reviews and updates that file, then reloads the active App configuration without restarting it. These files are not configuration version history. After a successful switch, the previous deployment's owned configuration is removed. Failed candidates are removed when Host confirms failure with no active instance; ambiguous runtime outcomes retain files for safety. The Host expands Releases into `storage/app-deployments/<appId>/revisions/<sha256>` directories.

Deploy and rollback requests persist a queued operation and return HTTP 202. The in-process runner serializes operations for one App while allowing different Apps to deploy concurrently. The page polls active operations and exposes deployment history with rollback actions. Rollback creates a new record from a previously successful deployment; whether its expanded revision is cached changes only deployment speed. The current deployment pointer changes only after Host reports success, so a failure leaves the active deployment untouched. Reconciliation reuses an expanded directory when the Release checksum matches. The Host currently uses stop-first Runtime replacement to avoid overlapping process-global queue state, restores the previous Runtime when replacement fails, retains the three most recently used expanded revisions per App, and logs artifact, activation, and cache-pruning phase durations.

During Hub startup, only managed Host availability is awaited. Restoring the complete deployment set runs in the background, so eager App activation does not delay Hub readiness. App Host currently reconciles that startup set through its existing serial operation queue; this bounds startup load and preserves deployment revision ordering.

The management API is restricted to system administrators. The browser page is available at `/hub`.
The Hub template redirects its root route to `/hub` and uses Applications as its primary navigation entry.

This version uses an in-process deployment runner rather than a separate durable queue worker. If Hub restarts during an operation, the persisted queued/deploying record is marked failed and can be retried manually. It does not yet provide remote Hosts, multiple Hosts or environments, configuration publications, external provider integration, or database migration rollback. Start-first replacement is not a strict zero-downtime guarantee for long-lived connections or incompatible database migrations. Database migration and seed behavior remains part of App startup.

Set `HUB_HOST_ENABLED=false` only for processes that need Hub metadata without starting its local managed Host, such as composition-only tests.

## Host supervision configuration

Hub configures its child-process supervisor through `hub.host` in the Hub's
configuration file. The supervisor receives resolved options and does not read
`APP_HOST_*` settings from the parent environment.

```yaml
hub:
  host:
    enabled: true
    driver: node
    host: 127.0.0.1
    # port: 13010 # Omit to find an available port starting at 13010.
    startTimeoutMs: 30000
    ipcTimeoutMs: 300000
    shutdownTimeoutMs: 30000
    autoRestart: true
    maxAutomaticRestarts: 5
    automaticRestartWindowMs: 60000
    automaticRestartBaseDelayMs: 250
```

Paths remain configurable through `appDeploymentsDir`, `appVolumesDir`, and
`configPath`; their defaults are under the Hub storage directory. Advanced
development overrides are `entrypoint`, `tsxCli`, and `tsconfig`.
Environment overrides use `HUB_HOST_*`, for example `HUB_HOST_PORT`,
`HUB_HOST_START_TIMEOUT_MS`, `HUB_HOST_AUTO_RESTART`, `HUB_HOST_ENTRY`,
`HUB_HOST_TSX_CLI`, and `HUB_HOST_TSCONFIG`. Directory overrides are
`HUB_HOST_DEPLOYMENTS_DIR`, `HUB_HOST_VOLUMES_DIR`, and `HUB_HOST_CONFIG_PATH`.
The default driver is `node` in production and `tsx` otherwise.

This does not change standalone Host configuration: a directly launched Host
still reads its own top-level `host` configuration and `APP_HOST_*` environment
mappings. It does not instantiate a supervisor; process supervision belongs to
Docker, systemd, or another external process manager. In Hub-managed mode, Hub
passes the selected port and paths to the child process.

## Verification

The application catalog returns lightweight summaries using three database
queries and one shared Host status snapshot, independent of the number of Apps.
It does not load release templates or deployment histories. Opening an App
loads only its overview. Releases and deployment history load when their tabs
are selected; deployment rows include the release version and checksum without
requiring the Releases tab's dataset. Configuration loads only for Configuration,
Resources, or deployment dialogs. Deployment polling refreshes the overview and
the visible deployment history, not inactive tabs. Histories remain unpaginated.

```bash
pnpm --filter @nocobase/app-plugin-hub lint
pnpm --filter @nocobase/app-plugin-hub typecheck
pnpm --filter @nocobase/app-plugin-hub test
pnpm --filter @nocobase/app-plugin-hub build
```
