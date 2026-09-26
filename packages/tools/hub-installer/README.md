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

The target must be new or empty. The command resolves the version, generates and builds the Hub in a temporary build directory, unpacks the deployment archive into a release directory, writes the configuration, applies the database migrations, and starts the Hub with pm2, waiting until its health check answers. Anything it wrote is removed again if it fails before the Hub is switched on, so running it again starts clean.

| Flag               | Default                   | Purpose                                                                                   |
| ------------------ | ------------------------- | ----------------------------------------------------------------------------------------- |
| `--hub-version`    | `latest`                  | Template version or dist-tag. Resolved to an exact version before anything is built.      |
| `--origin`         | `http://HOST:PORT`        | Public origin without `/hub`. Set it before exposing the Hub.                             |
| `--host`, `--port` | `127.0.0.1`, `13000`      | Where the Hub listens. Keep the loopback default behind a reverse proxy.                  |
| `--dialect`        | `sqlite`                  | Database. Anything else adds `@nocobase/db-<dialect>` before the build and needs `--set`. |
| `--set`            |                           | `key=value` passed to `nocobase config set`, repeatable.                                  |
| `--set-from-env`   |                           | `key=VARIABLE` read from the environment, repeatable. Use it for passwords.               |
| `--registry`       | `https://npm.nocobase.ai` | Registry for the template and NocoBase packages; `NOCOBASE_REGISTRY` also sets it.        |
| `--name`           | `nocobase-hub`            | pm2 process name.                                                                         |
| `--no-start`       |                           | Install without starting; the result names the command that starts it.                    |
| `--health-timeout` | `180`                     | Seconds to wait for the health check.                                                     |
| `--keep-source`    |                           | Keep the build directory, with the sources and development dependencies.                  |
| `--json`           |                           | Print one JSON result on stdout. Progress always goes to stderr.                          |

A PostgreSQL Hub, with the password taken from the environment:

```bash
HUB_DB_PASSWORD=... npx @nocobase/hub-installer install /srv/nocobase/hub \
  --origin https://apps.example.com --dialect postgres \
  --set database.connections.main.host=db.internal \
  --set database.connections.main.username=hub \
  --set-from-env database.connections.main.password=HUB_DB_PASSWORD
```

Afterwards, run `pm2 startup` once and execute the command it prints so pm2 restarts the Hub after a reboot, and proxy the origin to the Hub with `location /` and `client_max_body_size 260m`. The first sign-in comes from `users.initialAdmin` in `config.yml`; the template default is `nocobase` / `admin123`, to be changed after signing in.

## Upgrade

```bash
npx @nocobase/hub-installer upgrade --dir /srv/nocobase/hub
```

Upgrades to `latest`, or to the version or dist-tag given with `--to`. Everything that takes time happens while the current release keeps serving: the new release is built beside it (or reused, when that version is already on disk), then checked with its own CLI — `config check`, and `db apply --dry-run` to count the pending migrations. Only then does the downtime start: the Hub is stopped, its SQLite database, `config.yml` and `hub.env` are copied to `backups/<time>_<from>_to_<to>/`, `current` is switched, the migrations are applied, and the new release is started and must pass its health check. Stopping the Hub stops every application it hosts, and deployments in progress are marked failed.

If migrating or starting the new release fails, the upgrade rolls itself back: `current` returns to the previous release, the database is restored from the backup when the new release may have migrated it, and the previous release is started again. The command then exits with code `3`, or `4` if the previous release did not come back either, with the steps to take.

| Flag               | Default  | Purpose                                                                                        |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `--to`             | `latest` | Version or dist-tag. A version already recorded on disk is reused without building.            |
| `--backup-done`    |          | Required for any database but SQLite, which the installer cannot back up: back it up yourself. |
| `--keep`           | `3`      | Releases to keep on disk, the current one included; older ones are pruned after an upgrade.    |
| `--health-timeout` | `180`    | Seconds to wait for the new release's health check.                                            |
| `--keep-source`    |          | Keep the build directory.                                                                      |
| `--yes`            |          | Proceed without the confirmation prompt; required with `--json` or without a terminal.         |
| `--json`           |          | Print one JSON result on stdout.                                                               |

The backup covers what rolling back needs: upgrading the Hub migrates only the Hub's own database, not those of the applications it hosts. It is not a replacement for regular backups of `storage/`. When the machine's Node major differs from the one the current release was built for, the confirmation says so: the current release could not be rolled back to, and hosted applications have to be rebuilt with the new `--node-version`.

## Rollback

```bash
npx @nocobase/hub-installer rollback --dir /srv/nocobase/hub
```

Returns to the release the last upgrade came from, or to `--to <version>` among the releases on disk. When the upgrade being undone applied migrations, the database is restored from the backup taken before it, which discards whatever was written to the Hub since; `--no-restore` keeps the current database instead. Rolling back never runs migrations backwards. A release built for another Node major is refused, since its native modules would not load.

If an upgrade or rollback is interrupted while the Hub is down, `installer.json` records it: `status` warns, `upgrade` refuses to start, and `rollback` recovers — it undoes an interrupted upgrade, restoring the database, and finishes an interrupted rollback.

## Status

```bash
npx @nocobase/hub-installer status --dir /srv/nocobase/hub
```

Reports the current version, whether the Hub answers its health check, the pm2 process, the releases on disk and their size, whether the machine's Node major still matches the one the release was built for, and whether the registry has a newer version (`--offline` skips that). It changes nothing.

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

| Code | Meaning                                                                                  |
| ---- | ---------------------------------------------------------------------------------------- |
| `0`  | Success.                                                                                 |
| `1`  | The operation failed. A Hub that was already running was not touched.                    |
| `2`  | Invalid usage, a failed precheck or a declined confirmation; nothing was written.        |
| `3`  | An upgrade failed after the switch and was rolled back; the previous release is running. |
| `4`  | Rolling back failed as well; the Hub is down and the error lists what to do.             |
