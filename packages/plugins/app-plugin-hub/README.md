# @nocobase/app-plugin-hub

The first-party control plane for applications run by a managed NocoBase App Host.

The application catalog is searched and paginated on the server.
`GET /api/hub/apps?search=customer&page=1&pageSize=24` returns
`{ data: { items, total, page, pageSize } }`; search matches App IDs and names
case-insensitively, page size defaults to 24, and page size is limited to 100.
Deployment history is paginated on the server. `GET /api/hub/apps/:appId/deployments?page=1&pageSize=20` returns `{ data: { items, total, page, pageSize } }`; page size defaults to 20 and is limited to 100. The workspace refreshes only the selected page and returns to the first page after submitting a deployment or rollback.

The initial implementation supports a single Hub-spawned Host and in-process Apps. Its application catalog supports card and list views; each App opens into an operational detail workspace with runtime and deployment facts in the header plus Releases, Resources, post-deployment Configuration, and Settings tabs. Resources uses vertical navigation for Databases, Drives, Caching, and LLM services; safe summaries for the first three are discovered by configuration key, while LLM services remain reserved for a management API. Development guides both new and existing projects through building `storage/dist.tar.gz`, uploading it in Releases, and deploying it in Deployments. Releases precedes Deployments in the tab strip. The application parent URL opens Development before the first Release, Releases before the first deployment, and Deployments once deployed, falling back to the first accessible tab. Explicit tab URLs keep their selection. Release upload and deployment are separate actions; deployment uses a three-step Release, Configuration, and Review flow. Settings choose whether the App activates with Hub (`eager`, the default) or registers for activation on its first visit (`lazy`); deployments do not change this policy. The workspace also provides live Host status refresh, App access, start, stop, and removal. Runtime state always comes from App Host and is reported as unknown when Host is unavailable. Interactive operations reconcile only the selected App; complete deployment sets are reserved for Host startup recovery. Stop sets the persisted `enabled` policy to false while preserving the current deployment so Start can reactivate it. Remove permanently deletes the App record, Releases, deployment history, configuration, and App volume.

Releases accept a root `config.example.yml` or `config.example.yaml` as an editable template. Real `config.yml` files are not imported. Hub persists desired configuration privately under `storage/hub/app-configs/<appId>/configs/config.<deploymentId>.yml` and sends content and revision to Host. Host owns a separate runtime file under `storage/app-volumes/<appId>/configs/config.<deploymentId>.yml`, including atomic writes, replacement cleanup and publishing to the active runtime. These files are not configuration version history. Rollback preserves the target mode, not its old path. On Host readiness, Hub rebuilds recovery targets from its database and desired configuration files; the process supervisor does not retain an application deployment snapshot. The Host expands Releases into `storage/app-deployments/<appId>/revisions/<sha256>` directories.

For Config file deployments, Hub adds a random 32-byte authentication secret when `auth.secret` is missing, empty, or still contains the example placeholder. An explicitly configured empty or placeholder `session.secret` receives its own random secret; an omitted session secret retains the runtime fallback to the authentication secret. A secret supplied by the user, or already present in the current Config file, is preserved and reused by later deployments and configuration publications. External configuration does not create or modify a file secret.

Deploy and rollback requests persist a queued operation and return HTTP 202. The in-process runner serializes operations for one App while allowing different Apps to deploy concurrently. The page polls active operations and exposes deployment history with rollback actions. Rollback creates a new record from a previously successful deployment; whether its expanded revision is cached changes only deployment speed. The current deployment pointer changes only after Host reports success, so a failure leaves the active deployment untouched. Reconciliation reuses an expanded directory when the Release checksum matches. The Host currently uses stop-first Runtime replacement to avoid overlapping process-global queue state, restores the previous Runtime when replacement fails, retains the three most recently used expanded revisions per App, and logs artifact, activation, and cache-pruning phase durations.

During Hub startup, only managed Host availability is awaited. Restoring the complete deployment set runs in the background, so eager App activation does not delay Hub readiness. App Host currently reconciles that startup set through its existing serial operation queue; this bounds startup load and preserves deployment revision ordering.

The Client plugin defaults to its compatible `/hub` page. App details are
addressable at `<applicationsPath>/:appId/<tab>`; the detail Tabs are child
routes so direct links, refresh, and browser history preserve the selected App
and Tab. Applications can
configure the Client factory with `applicationsPath` and `rolesPath` to expose
a control-plane console. The Hub template uses
`/apps`, `/users`, and `/roles`; the roles page is a read-only product view of
the Hub-owned grants rather than the generic Permission Set editor.

Hub offers two roles: **Platform Administrator** (`hub-administrator`, 平台管理员) and **Application Administrator** (`hub-operator`, 应用管理员). These display names describe platform-wide management and management of applications created by the user, respectively; the role identifiers remain unchanged. The protected `hub-viewer` Permission Set remains for existing read-only accounts, but cannot be newly assigned and is omitted from the role matrix. Existing Viewers retain their permissions until an administrator explicitly changes their role. Every management API checks a `hub.app`, `hub.host`, or `user` resource action on the server rather than checking a role name. Administrators manage applications and users, Operators manage application releases and runtime operations, can delete their own Apps after confirmation, and Viewers have read-only access without raw configuration or configuration templates. Existing System Administrators receive the Hub Administrator role during upgrade, but the two roles do not implicitly inherit from one another at runtime.
Application ownership is enforced on the server in addition to action grants. Hub Administrators can access all Apps. Operators and Viewers can access only Apps whose `createdBy` matches their authenticated user ID, subject to their existing action permissions; Viewers still cannot create or modify Apps. The server records the creator when an App is created and ignores client-supplied ownership. Catalog search, totals, pagination, detail APIs, publishing credentials, and Host deployment status use the same boundary. Existing Apps without reliable ownership remain visible only to Hub Administrators until their ownership is explicitly established; upgrading does not guess or reassign creators. This controls Hub management access, while each hosted App retains its own business-data authentication and authorization.

The Hub template redirects its root and legacy `/hub` route to `/apps` and uses
Applications, User management, and Roles & permissions as its primary
navigation. These entries are declared on their owning routes and do not use
Refine resources as menu metadata. The template
does not expose the ordinary App Settings centre, notification centre,
workflows, or example plugins. The notification provider remains available for
in-page operation feedback.

This version uses an in-process deployment runner rather than a separate durable queue worker. If Hub restarts during an operation, the persisted queued/deploying record is marked failed and can be retried manually. It does not yet provide remote Hosts, multiple Hosts or environments, configuration publications, external provider integration, or database migration rollback. Start-first replacement is not a strict zero-downtime guarantee for long-lived connections or incompatible database migrations. Database migration and seed behavior remains part of App startup.

Set `HUB_HOST_ENABLED=false` only for processes that need Hub metadata without starting its local managed Host, such as composition-only tests.

## Host supervision configuration

`hubServiceToken` exposes `getHostProxyTarget()` for a standalone listener to read the current ready Host origin without starting it. The method returns `null` while Host is disabled, stopped, starting or failed, and reads Supervisor state again on every call so a restarted Host may use a different port. The Hub listener owns HTTP and WebSocket forwarding; plugin API routes remain application-local management endpoints. App IDs that overlap the Hub application's normalized public base path are rejected when created. IDs beginning with `__` are also rejected to match the managed Host's reserved namespace, which includes `/__live`, `/__ready`, and `/__health`.

`hub.publicHostUrl` controls the public entry used by the Visit App link. Set it to `/` when the Hub standalone listener proxies other paths on the same origin, as the Hub template does. An absolute origin supports an externally exposed Host; omitting it preserves direct Host links for existing plugin consumers. The internal proxy target always comes from Supervisor state, independently of this browser-facing setting.

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
The Hub template uses `node` in production and `auto` otherwise. `auto` follows the loaded App Host package: workspace TypeScript exports use `tsx`, while published JavaScript exports use `node`. Development mode therefore works with an installed package that ships only `dist`, without requiring its TypeScript sources. Set `driver` to `node` or `tsx` to explicitly choose a launcher.

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
the visible deployment history, not inactive tabs.

```bash
pnpm --filter @nocobase/app-plugin-hub lint
pnpm --filter @nocobase/app-plugin-hub typecheck
pnpm --filter @nocobase/app-plugin-hub test
pnpm --filter @nocobase/app-plugin-hub build
```

## App publishing API keys

The Hub **API Keys** page follows **Roles & permissions** in the main navigation. Administrators and Operators select specific existing Apps or **All applications (including future apps)** and grant only the existing `hub.app` actions `upload-release` and `deploy`. The API Keys plugin generates, hashes, verifies, expires and revokes credentials; Hub stores publishing permissions, App bindings and an encrypted recovery copy. Expiration is optional. While a key is active, its creator can retrieve it again through the authenticated Hub copy action; list responses never include the plaintext or ciphertext. The all-applications choice is a dynamic grant, so newly created Apps are included automatically; granting it requires the corresponding wildcard Hub permissions, and every request still checks the owner’s current permissions. Bindings and permissions cannot be edited after creation.

Use `Authorization: Bearer <key>` with `POST /api/hub/apps/:appId/releases` and `POST /api/hub/apps/:appId/deploy`. Publishing keys do not become user Sessions and cannot access configuration, user administration or key management. Each use additionally checks that its creator is enabled and still has the corresponding Hub permission. Revocation takes effect for subsequent requests; it does not cancel an already accepted deployment.

Management requires a signed-in user with `hub.app / manage-api-keys`, granted to `hub-administrator` and `hub-operator` by default. Operators can list, copy, disable, and delete only their own keys. Administrators can list, disable, and delete all publishing keys, but can copy only their own. Every key is bound to its creator; selected Apps and actions never exceed that user’s current permissions. Key lists display bound App metadata only when the current user can still read that App. After a role downgrade, inaccessible Apps are hidden without changing stored bindings or preventing the creator from revoking their old keys. Removing an App removes only its binding; removing the final binding deletes the credential. The forward-only multi-App migration preserves existing single-App bindings and retains only existing upload/deploy grants, never promoting legacy read grants to writes. The generic user API Keys plugin remains separate. See [the publishing-key guide](skills/nocobase-app-plugin-hub-api-keys/SKILL.md) for endpoint and scope details.

Hub reuses `@nocobase/app-plugin-api-keys` for key generation, hashing, expiry, verification, and credential management. Register `...hubApiKeyAuthentication()` in the Hub authentication configuration in place of `apiKey()`. It preserves the default user-key configuration and adds a `hub-publishing` configuration without Session authentication. Hub owns the App binding, scopes, encrypted recovery, permanent revocation rule, and current-owner authorization.

Recoverable Hub keys use AES-256-GCM with a purpose-specific key derived from the stable `auth.secret` (at least 32 characters), binding the ciphertext to its credential ID and owner. Keep this secret backed up separately from the database. Changing it without re-encrypting the stored copies makes those copies unrecoverable; credential hash verification remains independent. `POST /api/hub/api-keys/:keyId/reveal` requires an authenticated session, management permission and ownership, returns `no-store`, and logs only identifiers. Disabling clears the encrypted copy. Older keys that only have a hash cannot be recovered and must be replaced to enable copying.

## CLI release publishing

Default applications provide `pnpm nocobase app upload` and `app deploy`. Set `HUB_URL` to the Hub application URL including its mount path, for example `https://hub.example/main`, `HUB_APP_ID` to the target App, and `HUB_API_KEY` to a Hub publishing credential. Explicit `--hub`, `--app-id`, and `--api-key` flags override these variables; prefer the environment for credentials.

```bash
pnpm build --target linux-x64 --tar
pnpm nocobase app upload --deploy --json
pnpm nocobase app deploy --release-id <releaseId> --idempotency-key <ci-run-id> --wait --json
```

Uploads stream `storage/dist.tar.gz` (overridable with `--file`) into a private temporary file, compute SHA-256, validate the artifact, and stream it to artifact storage. The compressed limit is 256 MiB. `Content-Type` must be `application/gzip` or `application/octet-stream`; `X-Artifact-SHA256` can assert the digest. Temporary files are removed on success, validation failure, disconnect, or oversize input. Failed persistence removes the candidate artifact. Abrupt process termination can leave staging files or an artifact; crash reconciliation remains outside this release.

Release identity is scoped to an App and checksum. Version is a display label; different artifacts may have the same version. `Idempotency-Key` accepts 1–128 letters, digits, dots, underscores, colons and hyphens; reusing a key with a different checksum returns 409. The new canonical checksum table preserves all historical Release and Deployment IDs and selects the earliest existing Release for future retries instead of deleting duplicates.

Uploading saves a Release and does not deploy it unless `X-Hub-Deployment-Intent: explicit` is supplied by CLI `--deploy`. There is no automatic/manual deployment setting or default mode: users choose commands and automate them in their own scripts. Uploading with deployment requires both `upload-release` and `deploy`, reuses existing configuration preparation and the deployment executor, and commits the Release and queued deployment together. Retries return the original Release and operation ID without redeploying; an existing Release without a publishing deployment must be deployed using `app deploy`. Uploading it with `--deploy` returns `409 / NO_DEPLOYMENT`; the CLI also rejects a missing deployment ID without requiring `--wait`.

Publishing credentials continue to expose only `upload-release` and `deploy`, under the existing `hub.app` resource and current owner authorization. `GET /apps/:appId/deployments/:deploymentId/status` requires `deploy` and returns only IDs, status, and phase; it does not grant access to deployment configuration, diagnostics, release listings, or other App APIs. Upload responses include `releaseId`, `operationId` (currently the deployment ID), and `reused`; new uploads with a deployment return 202, retries and uploads without a deployment return 200.

Standalone deployments use a separate persistent retry table. The same `Idempotency-Key` and release/configuration request returns the original deployment; a changed request returns 409. CLI uploads default to the artifact checksum as retry identity; CLI deploy defaults to a digest of App and Release IDs. Supply a fresh `--idempotency-key` to intentionally redeploy the same Release. `app upload --wait` requires `--deploy` and is rejected locally before upload when it is missing. Timeout defaults to 600 seconds. Exit codes are 0 for confirmed success/acceptance, 1 for Hub rejection or failed deployment, 2 for local arguments/files, and 3 for network failures, timeout, or an unconfirmed outcome. `--json` prints a single versioned envelope; deployment state lives in `result.operationStatus`.

This remains the single-Hub deployment model. Restart recovery retains the existing behavior: queued or active deployments interrupted by restart are marked failed, not silently retried. Acceptance (202) does not promise eventual success; use `--wait` or inspect the returned deployment in Hub.

Both `app deploy --release-id <id> --config ./runtime.yml` and `app upload --deploy --config ./runtime.yml` accept an optional runtime YAML file (non-empty UTF-8, at most 1 MiB). Paths resolve from the App root. Omitting `--config` reuses the current Hub configuration; on first deployment, the existing Release-template initialization still applies. Supplied configuration replaces the configuration document through the existing Hub secret handling and YAML validation; it is not merged with arbitrary existing fields and never changes the Release template or archive. `app upload --config` without `--deploy` is rejected. Use `app deploy` to apply a different configuration to an already uploaded Release; configured upload retries reuse only the originally supplied configuration. Default deployment retry identity includes supplied configuration content. Configuration content is never printed in CLI results.

Configured uploads use `Content-Type: application/vnd.nocobase.release-upload.v1` and `X-Hub-Config-Length` (1–1048576 bytes). The request body is exactly that many UTF-8 configuration bytes followed by the unchanged gzip artifact. The checksum and artifact limit cover only the archive. Hub authorizes both upload and deploy before reading configuration, bounds the prefix in memory and streams the remainder. The persistent checksum mapping stores only a SHA-256 configuration fingerprint for conflict detection; configuration content stays in the private deployment config file. Unconfigured gzip/octet-stream uploads remain supported.

### Application names, IDs, and error notifications

Application names may be repeated across users and edited in Settings by an authorized owner or Hub Administrator. Renaming preserves the App ID, URL, releases, configuration, and runtime. The creation form generates an editable ID with an eight-character random hexadecimal suffix; IDs remain globally unique because they identify shared URLs, deployment records, and storage paths. Manual ID conflicts return `APP_EXISTS` without disclosing another application's owner. Hub operation failures use the shared top-right notification host, including failures while a dialog is open; they preserve form input and keep technical details collapsed.

Deployment commands (`app deploy` and `app upload --deploy`) wait for the final result by default. Use `--no-wait` to return after acceptance; acceptance does not mean deployment succeeded. Explicit `--wait` remains supported. Upload without `--deploy` only waits for the upload. `--timeout` defaults to 600 seconds; a timeout leaves the deployment outcome unconfirmed and does not cancel it.

### Delete a Hub user

Only Platform Administrators can delete users, after confirmation. Deleting the current user or the last enabled Platform Administrator is prohibited. Any App owned by the target blocks deletion until it is transferred or removed; deletion never removes Apps. Session/account cleanup and removal of the user's default and Hub publishing API Keys occur in one transaction. An inactive user identity, deletion time and actor remain for historical attribution. Application creation and publishing key creation lock and recheck the owner so a deleted user cannot acquire new resources. Existing users are not deleted by the upgrade migrations.
