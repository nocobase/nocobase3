---
name: nocobase-deployment
description: Plan, build, deploy, verify, upgrade, and troubleshoot NocoBase 3 applications in production, including standalone Node.js or Docker deployments and Hub publishing. Use when an application must move from source to a production environment or when a deployment failure needs diagnosis.
---

# NocoBase production deployment

Use this Skill to execute a complete deployment workflow. Read the application's `AGENTS.md` and `README.MD` before changing files or running stateful commands: the README documents this application's build targets, archive layout, configuration variables and Hub publishing commands. The Deployment section of the NocoBase 3 documentation is the reference for command details and platform-specific examples; in the nocobase3 source repository it is `docs/docs/<lang>/deployment/`.

Do not treat a process being healthy as proof that the application is usable. A deployment is complete only after the database, configuration, application behavior, workflow artifacts, and persistence checks below have evidence.

## Stop and identify the deployment

Before building or changing a server, record:

- The deployment mode: standalone Node.js, standalone Docker, Hub platform, or publishing an App to an existing Hub.
- The source revision, application version, Node.js and pnpm versions, target CPU/OS/libc, and the destination host.
- Whether the destination uses the existing database and storage, a new database, or a restore. Business data is not included in `dist`, `dist.tar.gz`, or a Docker image.
- The application base path, public origin, database type, external services, reverse proxy, persistent directories, and service identity.
- Whether the requested action is a first install, an update, a migration, a restart, a rollback, or a recovery.

Do not run production writes, migrations, seeds, uploads, deployments, or destructive removal until the target and the user's authorization are explicit. If the target or data plan is unresolved, stop and ask for it.

## Prepare the source and artifact

In the application project root, use the project's lockfile and declared pnpm version:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
```

Run the checks that the project actually defines; do not invent a test or lint command when it is absent. Build for the destination platform:

```bash
APP_BASE_PATH=/crm pnpm build --target linux-x64 --node-version 24 --tar
```

`pnpm build` creates the production `dist` tree and installs or retargets production dependencies for the selected platform. `--tar` additionally creates `storage/exports/dist.tar.gz`, containing `dist/` and `config.example.yml`; it does not contain the runtime configuration, database, uploads, or other business data. Inspect the archive before transfer:

```bash
tar -tzf storage/exports/dist.tar.gz | head -30
```

For a direct server deployment, transfer the archive and extract it into the deployment root. Nothing needs installing there: `pnpm build` already ran `pnpm install --prod` inside `dist/`, and the archive carries the resulting `dist/node_modules`. `dist/package.json` stays in the tree so that the same command can be rerun inside `dist/` on the server if `node_modules` was left out of a copy; that is a repair, not a step of a normal deployment, and it is never run in the application source tree. For Docker, build the image from the production `dist` tree and keep configuration and storage outside the image. Ensure the build target matches the server or image architecture, libc, and Node ABI.

## Decide the data operation

A deployment package carries code and production dependencies, not business data. Keep the existing database and storage mounts for an in-place update. When switching to a new database or server, perform a separate data migration or restore a coordinated backup before allowing users to write.

Before an update that can change schema, take a database and file backup and confirm the restore path. Ensure the database account can perform the configured migration and seed operations. Do not point a new instance at an empty database and describe the result as a data migration.

The default configuration uses managed schema migrations and automatic seeds. Determine whether the deployment should run them on startup. If migrations or seeds are run separately, set the corresponding automatic options to `false` and execute the supported CLI operation before starting the application. Record the migration and seed result; a successful process start alone is insufficient.

## Build and review production configuration

Prepare the complete runtime configuration before starting the service. At minimum review:

- Database dialect, host, port, database, credentials, schema and migration policy. A container's `localhost` means that container, not the host or another service.
- A unique stable `auth.secret` and `session.secret`. Keep them unchanged across restarts and upgrades and out of artifacts, source control, and logs.
- `users.initialAdmin.username` and `users.initialAdmin.password` for a new empty user table. These settings apply only during the initial seed and do not reset an existing account.
- `APP_PUBLIC_ORIGIN` as the external scheme and host without the application path, and `APP_BASE_PATH` as the public mount path used at build time and runtime.
- `APP_SERVER_HOST` and `APP_SERVER_PORT`, with containers normally listening on `0.0.0.0` and the proxy controlling external exposure.
- Persistent storage paths, file permissions, service identity, and any external database, object storage, mail, or callback settings.

The reverse proxy must preserve the public `Host` and protocol headers, forward cookies, and support WebSocket `Upgrade` and `Connection` headers. For Hub, proxy the entire site to Hub; do not expose a separate Host port or proxy only `/hub`.

## Choose the deployment path

### Standalone Node.js

Extract the archive as the service user or transfer ownership to that user. Keep `config.yml` and `storage/` beside `dist/`, configure `APP_CONFIG_FILE`, and run `node ./dist/server/standalone.js` through the service manager. Replace `dist` during an update while retaining configuration and storage. Do not start a second process against the same data directory.

### Standalone Docker

Build or transfer the image, bind-mount the complete runtime configuration read-only, and bind-mount the persistent storage. Validate the Compose file before starting. For a configuration file replacement, recreate the container so the process reads the new file. Keep the image, config, storage, and proxy changes separately identifiable.

### Hub platform

Deploy Hub with Docker or the Hub application template. Persist the Hub storage root, platform database, Releases, desired configurations, expanded application versions, application data volumes, and logs. Set Hub's `/hub` base path and route the complete public site to Hub. A Hub restart interrupts its hosted applications; after restart, verify each eager App individually.

### Publish an App to an existing Hub

Create or select the target App, build the artifact for the Host platform, and upload it. Uploading a Release does not switch the running version. Deploy the selected Release with the complete runtime configuration, wait for the operation result, and inspect the deployment record and App runtime. A separately uploaded Release is deployed with `app deploy`; do not re-upload it with `upload --deploy`.

For network uncertainty, inspect the Hub record before retrying. Reuse the same idempotency key and request when the result is unknown. Use a new key only for an intentional new deployment or a confirmed failed deployment. A supplied `--config` replaces the complete configuration document; submit all required fields rather than a partial patch.

## Handle workflow artifacts after production build

If the application contains DSL workflows or other compiled workflow artifacts, treat the production build as a new artifact set. The workflow definition is compiled into production JavaScript and receives a deployment hash; the development artifact or previous hash may not exist in the production package.

After deployment, check that each workflow's active version points to an artifact present in the production build. If the runtime reports `Workflow Artifact <key>/<hash> is missing`, do not enable the workflow by its database flow ID alone: that keeps the old hash. Enable the pending version by its deployed artifact hash, either with **Enable new version** on the workflow in the management UI or with `POST <APP_BASE_PATH>/api/workflows/<hash>/enable`, then trigger a real business event and inspect the run result. Keep source checking, artifact building, synchronization, enablement, and invocation as separate checks.

## Verify the deployed application

Collect evidence for each item:

1. The process, container, Hub, and Host report ready. An application answers `GET <APP_BASE_PATH>/api/healthz` with a JSON object whose `ok` is `true` (alongside the app name and base path); Hub answers at `/hub/api/healthz`.
2. The public URL, base path, static assets, page refresh, API requests, cookies, and WebSocket connections work through the real reverse proxy.
3. The configured administrator can sign in, and a normal user has the expected server-side permissions.
4. The application can read and write a known record in the intended database; the database is not an unexpected empty instance.
5. Upload and download a file if the application uses file storage.
6. Trigger one representative workflow and confirm its run completes with the expected business result.
7. Restart the service or recreate the container and confirm records, files, configuration, and enabled runtime behavior remain available.
8. In Hub mode, verify every hosted App separately; Hub readiness does not mean every eager App is ready.

Record the exact artifact or image digest, configuration revision, database migration result, workflow artifact hashes, logs checked, and verification time.

## Update, rollback, and recovery

Before an update, review migration and configuration differences and take a backup. A code rollback creates or selects an older runtime; it does not undo database migrations, business writes, or a historical configuration snapshot. Confirm database compatibility before switching back.

For recovery, stop the affected service, prepare the code and runtime matching the backup, restore the database, files, configuration, stable secrets, and persistent mounts, then start and verify. Restore external databases and object storage to a coordinated point in time. If only Hub metadata is restored and expanded application revisions are missing, redeploy the corresponding Release before declaring recovery complete.

## Report the result

Return a concise deployment report with these sections:

- Target and deployment mode.
- Source revision and artifact or image digest.
- Configuration, database, migration and seed status.
- Deployment operation ID and final status, if Hub is used.
- Workflow artifact and representative business verification.
- Restart or recovery verification.
- Logs and checks performed.
- Unresolved risks, skipped checks, and required follow-up.

Never claim a production deployment, migration, rollback, or recovery was completed when it was only planned, accepted by an API, or tested locally.
