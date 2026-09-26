# @nocobase/hub-installer

Installs, upgrades and rolls back a NocoBase 3 Hub on a server, for a Hub whose source you do not change. It generates the Hub from the published `@nocobase/app-template-hub`, builds it on the server, keeps only the deployment archive, and runs it under pm2. A Hub you customise is an application project: create it with `pnpm create @nocobase/app hub --template=hub` and deploy it like any other application. Docker remains the other way to run an unmodified Hub.

## Requirements

- Linux or macOS. On Windows, use WSL: switching releases relies on symbolic links and atomic renames.
- Node.js 24 or later, pnpm 11 or later, and `tar`.
- pm2 installed globally (`npm install -g pm2`) to start the Hub. A copy fetched through `npx` does not work, because `pm2 startup` writes a boot service that names pm2's own path.

## Install

```bash
npx @nocobase/hub-installer install /srv/nocobase/hub --origin https://apps.example.com
```

The target must be new or empty. Before writing anything, the command also checks that the port is free, that no pm2 process already uses the name (`pm2 start` on a taken name would restart that process with this Hub's configuration rather than start a new one), and that every variable named by `--set-from-env` is set. It then resolves the version, generates and builds the Hub in a temporary build directory, unpacks the deployment archive into a release directory, writes the configuration, applies the database migrations, and starts the Hub with pm2, waiting until its health check answers or pm2 reports the process as crashed. Anything it wrote is removed again if it fails before the Hub is switched on, so running it again starts clean — with `--keep-source`, the build directory is kept for inspection and has to be removed before retrying.

Ctrl-C (or SIGTERM) stops the step that is running and lets that cleanup happen; a second one exits at once.

| Flag               | Default                   | Purpose                                                                                   |
| ------------------ | ------------------------- | ----------------------------------------------------------------------------------------- |
| `--hub-version`    | `latest`                  | Template version or dist-tag. Resolved to an exact version before anything is built.      |
| `--origin`         | `http://HOST:PORT`        | Public origin without `/hub`. Set it before exposing the Hub.                             |
| `--host`, `--port` | `127.0.0.1`, `13000`      | Where the Hub listens. Keep the loopback default behind a reverse proxy.                  |
| `--dialect`        | `sqlite`                  | Database. Anything else adds `@nocobase/db-<dialect>` before the build and needs `--set`. |
| `--set`            |                           | `key=value` passed to `nocobase config set`, repeatable. Values are YAML scalars.         |
| `--set-from-env`   |                           | `key=VARIABLE` read from the environment, repeatable. Use it for passwords.               |
| `--registry`       | `https://npm.nocobase.ai` | Registry for the template and NocoBase packages; `NOCOBASE_REGISTRY` also sets it.        |
| `--name`           | `nocobase-hub`            | pm2 process name.                                                                         |
| `--no-start`       |                           | Install without starting; the result names the command that starts it.                    |
| `--health-timeout` | `180`                     | Seconds to wait for the health check.                                                     |
| `--keep-source`    |                           | Keep the build directory, with the sources and development dependencies, even on failure. |
| `--json`           |                           | Print one JSON result on stdout. Progress always goes to stderr.                          |

A PostgreSQL Hub, with the password taken from the environment:

```bash
HUB_DB_PASSWORD=... npx @nocobase/hub-installer install /srv/nocobase/hub \
  --origin https://apps.example.com --dialect postgres \
  --set database.connections.main.host=db.internal \
  --set database.connections.main.username=hub \
  --set-from-env database.connections.main.password=HUB_DB_PASSWORD
```

`--set` values are read as YAML scalars by `nocobase config set`: `0123` becomes the number `123` and `no` becomes `false`, so quote text that looks like either, as in `--set 'key="0123"'`. Values are masked in the installer's own output, but a secret passed with `--set` is still visible to other users in the process list while the command runs; pass secrets with `--set-from-env`.

Afterwards, run `pm2 startup` once and execute the command it prints so pm2 restarts the Hub after a reboot, and proxy the origin to the Hub with `location /` and `client_max_body_size 260m`. The first sign-in comes from `users.initialAdmin` in `config.yml`; the template default is `nocobase` / `admin123`, to be changed after signing in.

## Upgrade

```bash
npx @nocobase/hub-installer upgrade --dir /srv/nocobase/hub
```

Upgrades to `latest`, or to the version or dist-tag given with `--to`. Everything that takes time happens while the current release keeps serving: the new release is built beside it (or reused, when that version is already on disk), then checked with its own CLI — `config check`, and `db apply --dry-run` to count the pending migrations. Only then does the downtime start: the Hub is stopped, its SQLite database, `config.yml` and `hub.env` are copied to `backups/<time>_<from>_to_<to>/`, `current` is switched, the migrations are applied, and the new release is started and must pass its health check. Stopping the Hub stops every application it hosts, and deployments in progress are marked failed.

If migrating or starting the new release fails, the upgrade rolls itself back: `current` returns to the previous release, the database is restored from the backup when the new release may have migrated it, and the previous release is started again. The command then exits with code `3`. If the previous release does not come back either, it exits with `4`, keeps the new release on disk, and leaves the operation pending, so `rollback` finishes the job once the cause is fixed.

A version older than the running one is refused: the older release knows nothing of the newer migrations. Going back is what `rollback` is for. A release already on disk is reused only when it was built for this platform and Node major; otherwise it is built again. The pm2 process named in `installer.json` must belong to this Hub root, and once the Hub is stopped its port must be free, so the health check cannot be answered by anything but the new release.

| Flag               | Default  | Purpose                                                                                           |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| `--to`             | `latest` | Version or dist-tag, not older than the running one. A matching release on disk is reused.        |
| `--backup-done`    |          | Required for any database but SQLite, which the installer cannot back up: back it up yourself.    |
| `--keep`           | `3`      | Releases to keep on disk (at least 2). The new release and the one upgraded from are always kept. |
| `--health-timeout` | `180`    | Seconds to wait for the new release's health check.                                               |
| `--keep-source`    |          | Keep the build directory.                                                                         |
| `--yes`            |          | Proceed without the confirmation prompt; required with `--json` or without a terminal.            |
| `--json`           |          | Print one JSON result on stdout.                                                                  |

The backup covers what rolling back needs: upgrading the Hub migrates only the Hub's own database, not those of the applications it hosts. It is not a replacement for regular backups of `storage/`, and backups are not pruned: remove old ones from `backups/` yourself. When the machine's Node major differs from the one the current release was built for, the confirmation says so: the current release could not be rolled back to, and hosted applications have to be rebuilt with the new `--node-version`.

## Rollback

```bash
npx @nocobase/hub-installer rollback --dir /srv/nocobase/hub
```

Returns to the release the last upgrade came from, or to `--to <version>` among the releases on disk. When the upgrade being undone applied migrations, the database is restored from the backup taken before it, which discards whatever was written to the Hub since; `--no-restore` keeps the current database instead. A Hub on an external database has no database in its backups, so nothing is restored and the command says so: restore that database from your own backup. Rolling back never runs migrations backwards. A release built for another Node major is refused, since its native modules would not load.

If the release it returns to does not start, the rollback stays pending, and running `rollback` again retries it — restore included — once the cause is fixed.

If an upgrade or rollback is interrupted while the Hub is down, `installer.json` records it: `status` warns, `upgrade` refuses to start, and `rollback` recovers. It undoes an interrupted upgrade — restoring the database only when the upgrade had already switched releases, since before that nothing was migrated — and finishes an interrupted rollback.

## Status

```bash
npx @nocobase/hub-installer status --dir /srv/nocobase/hub
```

Reports the current version, whether the Hub answers its health check, the pm2 process, the releases on disk and their size, whether the machine's Node major still matches the one the release was built for, and whether the registry has a newer version (`--offline` skips that). It changes nothing, and does not start the pm2 daemon when it is not running.

## Layout

```text
/srv/nocobase/hub/
├── hub.env               runtime variables, read by pm2 and by every hub-installer command
├── config.yml            written by `nocobase config init`, shared by every release
├── storage/              HUB_STORAGE_DIR: the Hub's database, uploaded releases and hosted applications
├── logs/                 the Hub's stdout and stderr, collected by pm2
├── ecosystem.config.cjs  the pm2 configuration every start goes through
├── releases/<version>/hub/  dist/ and config.example.yml from the deployment archive
├── current -> releases/<version>/hub
├── backups/              database and configuration copied before each upgrade
└── installer.json        what the installer knows: current version, dialect, drivers, history
```

`APP_CONFIG_FILE` and `HUB_STORAGE_DIR` in `hub.env` are absolute. A built server treats the directory above `dist/` as its deployment root and would otherwise keep its configuration and data inside the release directory.

pm2 runs `node` itself with `dist/server/standalone.js` as its argument (`interpreter: 'none'`). Pointing pm2's `script` at `standalone.js` would load it through pm2's own wrapper, where `import.meta.main` is false, and the Hub would never start. pm2 also keeps the release path it resolved at `pm2 start`, so after `current` changes the process has to be deleted and started again rather than restarted.

## Exit codes

| Code | Meaning                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success.                                                                                                               |
| `1`  | The operation failed. A Hub that was already running was not touched.                                                  |
| `2`  | Invalid usage, a failed precheck — including an unsupported Node.js — or a declined confirmation; nothing was written. |
| `3`  | An upgrade failed after the switch and was rolled back; the previous release is running.                               |
| `4`  | Rolling back failed as well; the Hub is down and the error lists what to do.                                           |
